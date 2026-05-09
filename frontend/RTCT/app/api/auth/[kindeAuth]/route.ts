import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";

export const GET = handleAuth();

// import { NextResponse } from "next/server";

// export async function GET() {
//   return NextResponse.json({
//     message: "Kinde auth disabled for local development",
//     user: {
//       id: "local-user-1",
//       first_name: "Local",
//       last_name: "User",
//       email: "local@rtct.dev",
//     },
//   });
// }
