"use client";
import React, { useState, useEffect, useRef } from "react";
import SideBar from "./components/ChatSidebar";
import ChatSection from "./components/ChatSection";
import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import { socket } from "@/app/utils/socket";
import axios from "axios";
import NavbarComponent from "./components/Navbar";
import { Progress } from "@nextui-org/react";

const ChatApp = () => {
    const { user, getToken } = useKindeBrowserClient();
    const [showChat, setShowChat] = useState(false);
    const [selectedChat, setSelectedChat] = useState<any>(null);
    const [chatData, setChatData] = useState(new Map<string, [any, any[]]>());
    const [drafts, setDrafts] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        if (!user) return;

        // ─── Auth + connect ────────────────────────────────────────────────
        socket.auth = { token: getToken() };
        socket.connect();

        // ─── Register message listeners BEFORE the axios call ─────────────
        // This way they're always registered exactly once per effect lifecycle.
        // We use off() first so that re-runs of this effect never stack handlers.

        const onProjectMessage = (projectId: string, sender: any, msg: any) => {
            setChatData((prev) => {
                const next = new Map(prev);
                const entry = next.get(projectId);
                if (!entry) return prev;                // unknown room – ignore
                const newEntry: [any, any[]] = [entry[0], [...entry[1], msg]];
                next.set(projectId, newEntry);
                // Mirror into selectedChat if it's the active conversation
                setSelectedChat((sel: any) => {
                    if (sel && sel[0].id === projectId) return newEntry;
                    return sel;
                });
                return next;
            });
        };

        const onDirectMessage = (sender: any, msg: any) => {
            setChatData((prev) => {
                const next = new Map(prev);
                const entry = next.get(sender.id);
                const newEntry: [any, any[]] = entry
                    ? [entry[0], [...entry[1], msg]]
                    : [sender, [msg]];
                next.set(sender.id, newEntry);
                setSelectedChat((sel: any) => {
                    if (sel && sel[0].id === sender.id) return newEntry;
                    return sel;
                });
                return next;
            });
        };

        // Remove any stale handlers from a previous mount before adding fresh ones
        socket.off("project:message:receive", onProjectMessage);
        socket.off("message:receive", onDirectMessage);
        socket.on("project:message:receive", onProjectMessage);
        socket.on("message:receive", onDirectMessage);

        // ─── Fetch sidebar contacts + join project rooms ───────────────────
        axios
            .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/users/initial_chats`, {
                params: { audience: "rtct_backend_api" },
                headers: { Authorization: "Bearer " + getToken() },
            })
            .then((response) => {
                if (!response.data) return;

                const map = new Map<string, [any, any[]]>();

                // Group chats
                for (const project of response.data) {
                    map.set(project.projectId, [
                        {
                            id: project.projectId,
                            first_name: project.name,
                            last_name: "",
                            type: "group",
                            image: project.image,
                        },
                        [],
                    ]);
                    socket.emit("project:join", project.projectId);
                }

                // Direct / personal chats (one entry per unique team-mate)
                for (const project of response.data) {
                    for (const member of project.members) {
                        if (member.id === user?.id) continue;
                        if (!map.has(member.id)) {
                            map.set(member.id, [
                                {
                                    id: member.id,
                                    first_name: member.name,
                                    last_name: "",
                                    type: "personal",
                                    image: member.image,
                                },
                                [],
                            ]);
                        }
                    }
                }

                // Set contacts map WITHOUT clearing existing messages
                // (use a functional update so we merge into whatever is already there)
                setChatData((prev) => {
                    // If contacts have already been loaded once, keep existing message arrays
                    const next = new Map(map);
                    for (const [key, entry] of prev) {
                        const existing = next.get(key);
                        if (existing) {
                            // Preserve accumulated messages from the previous render
                            next.set(key, [existing[0], entry[1]]);
                        }
                    }
                    return next;
                });

                // Ask server to replay in-memory DM history
                socket.emit("message:history", {});
            })
            .catch(console.error);

        // ─── Cleanup ──────────────────────────────────────────────────────
        return () => {
            socket.off("project:message:receive", onProjectMessage);
            socket.off("message:receive", onDirectMessage);
            socket.disconnect();
        };
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Handlers ──────────────────────────────────────────────────────────
    const handleChatClick = (chat: any) => {
        setShowChat(true);
        setSelectedChat(chat);
    };

    const handleDraftChange = (chatId: string, draft: string) => {
        setDrafts((prev) => ({ ...prev, [chatId]: draft }));
    };

    const inputRef = useRef<HTMLInputElement>(null);

    const onSend = (
        target: any,
        msg: string,
        attachment?: { type: "image" | "file"; dataUrl: string; fileName: string }
    ) => {
        if (!msg.trim() && !attachment) return;

        const content: any = attachment
            ? { msgType: attachment.type, dataUrl: attachment.dataUrl, fileName: attachment.fileName, text: msg || "" }
            : { msgType: "text", text: msg };

        // Emit to backend – backend will NOT echo back to sender (fixed there too)
        if (target.type === "group") {
            socket.emit("project:message:send", target.id, content);
        } else {
            socket.emit("message:send", target, content);
        }

        // Optimistic update: add to sender's own view immediately
        const packet = {
            id: `optimistic-${Date.now()}`,
            senderID: user?.id,
            senderName: `${user?.given_name} ${user?.family_name}`,
            timestamp: Date.now(),
            content,
        };

        const chatKey = target.id;
        setChatData((prev) => {
            const next = new Map(prev);
            const entry = next.get(chatKey);
            if (!entry) return prev;
            next.set(chatKey, [entry[0], [...entry[1], packet]]);
            return next;
        });
        setSelectedChat((sel: any) => {
            if (!sel || sel[0].id !== chatKey) return sel;
            return [sel[0], [...sel[1], packet]];
        });

        if (drafts[target.id]) handleDraftChange(target.id, "");
        inputRef.current?.focus();
    };

    return (
        <>
            <NavbarComponent />
            <div id="chat" className="h-[--mainheight] flex bg-black">
                <div className={`${showChat ? "hidden" : "block"} md:block w-full md:w-1/4`}>
                    <SideBar
                        chatData={chatData}
                        onChatClick={handleChatClick}
                        selectedChat={selectedChat}
                    />
                </div>
                <div className={`${showChat ? "block" : "hidden"} md:block w-full md:w-3/4`}>
                    <ChatSection
                        user={user}
                        chatData={selectedChat}
                        onBack={() => setShowChat(false)}
                        draft={drafts[selectedChat?.chatID] || ""}
                        onDraftChange={handleDraftChange}
                        onSend={onSend}
                    />
                </div>
            </div>
            <div id="vc" className="w-full h-[--mainheight] bg-[--chatSectionBg] rounded-t-[30px] rounded-r-[30px] hidden text-center text-2xl">
                <Progress color="danger" size="sm" isIndeterminate aria-label="Loading..." className="w-full" />
            </div>
        </>
    );
};

export default ChatApp;
