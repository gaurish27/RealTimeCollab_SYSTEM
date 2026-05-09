"use client";

// ── All imports at the top (previously some were after the return – invalid!) ──
import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import {
    LiveKitRoom,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Spinner } from "@nextui-org/react";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import NavbarComponent from "@/app/(routes)/meeting/components/Navbar";
import { VideoConference } from "@/app/(routes)/meeting/components/VIdeoConference";

export default function Page({ params }: any) {
    const { user } = useKindeBrowserClient();
    const router = useRouter();
    const room = params.roomId;
    const [token, setToken] = useState("");

    useEffect(() => {
        if (!user) return;

        const displayName = `${user.given_name ?? ""} ${user.family_name ?? ""}`.trim();
        const userId = user.id; // unique, stable identity – prevents LiveKit collision

        (async () => {
            try {
                const resp = await fetch(
                    `/api/get-participant-token?room=${encodeURIComponent(room)}&username=${encodeURIComponent(displayName)}&userId=${encodeURIComponent(userId)}`
                );
                const data = await resp.json();
                setToken(data.token);
            } catch (e) {
                console.error(e);
            }
        })();
    }, [user, room]);

    if (token === "") {
        return (
            <div className={"flex w-screen h-screen flex-col"}>
                <NavbarComponent />
                <div className="w-full h-full flex flex-col justify-center items-center bg-[#111114] rounded-lg z-10 cursor-default">
                    <Spinner size="lg" color="primary" />
                    <p className="text-white mt-4 text-sm opacity-60">Connecting to meeting…</p>
                </div>
            </div>
        );
    }

    return (
        <div className={"flex w-screen h-screen flex-col"}>
            <NavbarComponent />
            <LiveKitRoom
                video={true}
                audio={true}
                token={token}
                serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
                data-lk-theme="default"
                style={{ height: "90%" }}
                onDisconnected={() => router.push("/chat")}
            >
                <VideoConference />
            </LiveKitRoom>
        </div>
    );
}
