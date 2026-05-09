import dotenv from "dotenv";
dotenv.config();

import express, { Express, NextFunction, Request, Response } from "express";
import { createServer } from "node:http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { Db, MongoClient, ServerApiVersion } from "mongodb";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { randomUUID } from "node:crypto";
import { jwtVerify } from "@kinde-oss/kinde-node-express";

import userRouter from "./users/users";
import projectsRouter from "./projects/projects";

const uri =
  process.env.MONGO_URI ||
  "mongodb+srv://Gaurish:gaurish@gaurish.iq4ftz9.mongodb.net/?appName=Gaurish";

export const mongoClient = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

export let mongoDb: Db;

async function run() {
  try {
    await mongoClient.connect();
    await mongoClient.db("rtct").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    mongoDb = mongoClient.db("rtct");

    // Ensure indexes so history queries are fast
    await mongoDb.collection("direct_messages").createIndex({ fromId: 1 });
    await mongoDb.collection("direct_messages").createIndex({ toId: 1 });
    await mongoDb.collection("project_messages").createIndex({ projectId: 1 });
  } catch (e) {
    console.error(e);
  }
}

run().catch(console.dir);

/* ==================== EXPRESS ==================== */
const app: Express = express();
const server = createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: "/socket.io",
});

const port = process.env.PORT || 5000;

/* ==================== POSTGRES ==================== */
export const prisma = new PrismaClient();

/* ==================== STATE ==================== */
const socketUsersMap = new Map<
  Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  any
>();

/* ==================== AUTH ==================== */
const verifier = jwtVerify("https://oneteam.kinde.com", {
  audience: "rtct_backend_api",
});

export { verifier };

export async function verifierMiddleware(
  req: any,
  res: any,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.split(" ")[1]) || "";
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };
    const result = await fetch(
      "https://oneteam.kinde.com/oauth2/user_profile",
      { method: "GET", headers },
    );
    console.log(result);

    if (result.status === 200) {
      req.user = await result.json();
      next();
      return;
    }
    res.send("Invalid token").status(401);
    return;
  } catch (err) {
    console.log(err);
    res.send("Invalid token ERROR").status(401);
    return;
  }
}

/* ==================== HELPERS ==================== */
/**
 * Builds a message packet.
 * `msg` can be a plain string (text) OR a content object {msgType, dataUrl, fileName, text}.
 */
function populateMessagePacket(user: any, msg: string | Record<string, any>) {
  const content: Record<string, any> =
    typeof msg === "string"
      ? { msgType: "text", text: msg }
      : msg; // already has msgType, dataUrl, fileName, etc.

  return {
    id: randomUUID(),
    senderID: user.id,
    senderName: `${user.first_name} ${user.last_name}`,
    timestamp: Date.now(),
    content,
  };
}

/**
 * Persist a direct message to MongoDB.
 * We store it once with both fromId and toId so either participant can query it.
 */
async function saveDm(fromUser: any, toUser: any, packet: any) {
  if (!mongoDb) return; // guard against race at startup
  try {
    await mongoDb.collection("direct_messages").insertOne({
      fromId: fromUser.id,
      toId: toUser.id,
      fromUser,
      toUser,
      packet,
    });
  } catch (e) {
    console.error("[MongoDB] Failed to save DM:", e);
  }
}

/**
 * Persist a project/group message to MongoDB.
 */
async function saveProjectMessage(projectId: string, sender: any, packet: any) {
  if (!mongoDb) return;
  try {
    await mongoDb.collection("project_messages").insertOne({
      projectId,
      sender,
      packet,
    });
  } catch (e) {
    console.error("[MongoDB] Failed to save project message:", e);
  }
}

/* ==================== MIDDLEWARE ==================== */
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "25mb" }));

app.use("/users", userRouter);
app.use("/projects", projectsRouter);

app.get("/", (_: Request, res: Response) =>
  res.send("RTCT Backend running 🚀"),
);

/* ==================== SOCKET AUTH ==================== */
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  const result = await fetch("https://oneteam.kinde.com/oauth2/user_profile", {
    method: "GET",
    headers,
  });

  if (result.status === 200) {
    socketUsersMap.set(socket, await result.json());
    next();
    return;
  }
  next(new Error("not authorized"));
});

/* ==================== SOCKET EVENTS ==================== */
io.on("connection", (socket) => {
  const user = socketUsersMap.get(socket);
  console.log(user.first_name + " connected");

  socket.on("disconnect", () => {
    console.log(user.first_name + " disconnected");
    socketUsersMap.delete(socket);
  });

  socket.on("joinRoom", (room) => {
    socket.join(room);
  });

  socket.on("sendMessageMeet", ({ room, username, message }) => {
    io.to(room).emit("messageMeet", username, message);
  });

  /* ── Project: join room + replay history from MongoDB ── */
  socket.on("project:join", async (projectId) => {
    const user = socketUsersMap.get(socket);
    const project = await prisma.project
      .findUnique({
        include: { members: true, admin: true },
        where: { projectId },
      })
      .catch((err) => { console.log(err); });

    if (!project) return;

    const isMember =
      JSON.stringify(project.members).includes(user.id) ||
      project.adminId === user.id;

    if (!isMember) return;

    socket.join(projectId);

    // Load persisted history from MongoDB (survives restarts)
    if (!mongoDb) return;
    try {
      const history = await mongoDb
        .collection("project_messages")
        .find({ projectId })
        .sort({ "packet.timestamp": 1 })
        .toArray();

      for (const doc of history) {
        socket.emit("project:message:receive", projectId, doc.sender, doc.packet);
      }
    } catch (e) {
      console.error("[MongoDB] Failed to load project history:", e);
    }
  });

  /* ── Project: send message + persist ── */
  socket.on("project:message:send", async (projectId, msg) => {
    const user = socketUsersMap.get(socket);
    if (!socket.rooms.has(projectId)) return;

    const packet = populateMessagePacket(user, msg);

    // socket.to() excludes the sender — frontend handles sender's copy optimistically
    socket.to(projectId).emit("project:message:receive", projectId, user, packet);

    // Persist to MongoDB so history survives restarts
    await saveProjectMessage(projectId, user, packet);
  });

  /* ── DM: load history from MongoDB ── */
  socket.on("message:history", async () => {
    const user = socketUsersMap.get(socket);
    if (!mongoDb) return;

    try {
      // Find all DMs where this user is either sender or receiver
      const history = await mongoDb
        .collection("direct_messages")
        .find({ $or: [{ fromId: user.id }, { toId: user.id }] })
        .sort({ "packet.timestamp": 1 })
        .toArray();

      for (const doc of history) {
        // From this user's perspective, the "other person" is always the conversation partner
        const otherPerson = doc.fromId === user.id ? doc.toUser : doc.fromUser;
        socket.emit("message:receive", otherPerson, doc.packet);
      }
    } catch (e) {
      console.error("[MongoDB] Failed to load DM history:", e);
    }
  });

  /* ── DM: send message + persist ── */
  socket.on("message:send", async (target, msg) => {
    const user = socketUsersMap.get(socket);
    const packet = populateMessagePacket(user, msg);

    // Persist to MongoDB (the source of truth)
    await saveDm(user, target, packet);

    // Do NOT echo back to sender — frontend already added it via optimistic update.
    // Only forward to the receiver if they are online.
    const targetSocket = Array.from(socketUsersMap).find(
      ([_, u]) => u.id === target.id,
    );
    if (!targetSocket?.length) return;
    targetSocket[0].emit("message:receive", user, packet);
    console.log(
      "forwarded message to " + targetSocket[1].first_name,
    );
  });
});

/* ==================== START ==================== */
server.listen(port, () => {
  console.log(`[server] running at http://localhost:${port}`);
});
