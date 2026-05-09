"use client";

import {
    CircleArrowOutUpRight,
    Copy,
    Mic,
    MicOff,
    Video,
    VideoOff,
    Users,
    MessageSquareMore,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@nextui-org/react";
import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import NavbarComponent from "./components/Navbar";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Derives a deterministic, shared room ID so that all participants
 * who intend to be in the same call always land in the same LiveKit room.
 *
 * - Group call  → groupId  (the projectId, shared by all members)
 * - 1-on-1 call → sorted pair of both user IDs joined with "--"
 *                 so user A + user B always produce the same string
 *                 regardless of who started the call first.
 */
function deriveRoomId(groupId: string | null, myUserId: string | null, otherUserId: string | null): string | null {
    if (groupId) return groupId;
    if (myUserId && otherUserId) {
        // sort ensures A-B === B-A (order-independent)
        return [myUserId, otherUserId].sort().join("--");
    }
    return null;
}

const Page = () => {
    const { user } = useKindeBrowserClient();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Query params passed by the chat sidebar when starting a call
    const groupId = searchParams.get("groupId");       // present for group calls
    const otherUserId = searchParams.get("userId");    // present for 1-on-1 calls
    const chatName = searchParams.get("name") ?? "Meeting"; // display name for lobby

    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);

    // Derive the shared room ID as soon as we have the user
    useEffect(() => {
        if (!user) return;
        const id = deriveRoomId(groupId, user.id, otherUserId);
        setRoomId(id);
    }, [user, groupId, otherUserId]);

    // Camera preview in the lobby
    useEffect(() => {
        let active = true;
        if (videoOn) {
            navigator.mediaDevices
                .getUserMedia({ video: true, audio: micOn })
                .then((s) => {
                    if (!active) { s.getTracks().forEach(t => t.stop()); return; }
                    setStream(s);
                    if (videoRef.current) videoRef.current.srcObject = s;
                })
                .catch(() => {
                    setVideoOn(false);
                });
        } else {
            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
                setStream(null);
            }
            if (videoRef.current) videoRef.current.srcObject = null;
        }
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoOn]);

    // Toggle mic on existing stream without restarting camera
    useEffect(() => {
        if (stream) {
            stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
        }
    }, [micOn, stream]);

    // Clean up preview stream when navigating away
    useEffect(() => {
        return () => {
            stream?.getTracks().forEach((t) => t.stop());
        };
    }, [stream]);

    const meetingLink = roomId ? `${window.location.origin}/meeting/${roomId}` : "";

    const handleCopyLink = () => {
        if (!meetingLink) return;
        navigator.clipboard.writeText(meetingLink);
        setCopied(true);
        toast.success("Meeting link copied!");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleJoinRoom = () => {
        if (!roomId) {
            toast.error("Could not determine meeting room. Please try again.");
            return;
        }
        // Stop the preview stream – LiveKit will manage devices inside the room
        stream?.getTracks().forEach((t) => t.stop());
        setStream(null);
        router.push(`/meeting/${roomId}`);
    };

    const callLabel = groupId ? `Group call – ${chatName}` : `Call with ${chatName}`;

    return (
        <>
            <NavbarComponent />
            <div
                id="meeting"
                className="h-[--mainheight] flex flex-col md:flex-row bg-[#0e0e12] overflow-hidden"
            >
                {/* ── Left: preview + controls ── */}
                <div className="flex flex-col items-center justify-center flex-1 p-6 gap-6">
                    <h1 className="text-white text-2xl font-semibold tracking-tight">{callLabel}</h1>

                    {/* Camera preview */}
                    <div className="relative w-full max-w-lg aspect-video bg-[#1c1c24] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
                        {videoOn ? (
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover scale-x-[-1]"
                            />
                        ) : (
                            <div className="flex flex-col items-center gap-3 text-white/40">
                                <VideoOff size={52} />
                                <p className="text-sm">Camera is off</p>
                            </div>
                        )}
                        {/* Name tag */}
                        {user && (
                            <p className="absolute bottom-3 left-4 text-white text-sm font-medium bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                {user.given_name} {user.family_name} (You)
                            </p>
                        )}
                    </div>

                    {/* Mic / Camera toggles */}
                    <div className="flex gap-4">
                        <Button
                            isIconOnly
                            radius="full"
                            size="lg"
                            className={micOn ? "bg-[--darkBtn] text-white" : "bg-neutral-800 text-white"}
                            onClick={() => setMicOn(!micOn)}
                            title={micOn ? "Mute mic" : "Unmute mic"}
                        >
                            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                        </Button>
                        <Button
                            isIconOnly
                            radius="full"
                            size="lg"
                            className={videoOn ? "bg-[--darkBtn] text-white" : "bg-neutral-800 text-white"}
                            onClick={() => setVideoOn(!videoOn)}
                            title={videoOn ? "Turn off camera" : "Turn on camera"}
                        >
                            {videoOn ? <Video size={20} /> : <VideoOff size={20} />}
                        </Button>
                    </div>

                    {/* Join button */}
                    <Button
                        onClick={handleJoinRoom}
                        className="bg-[--darkBtn] rounded-full h-12 px-10 text-white text-lg font-bold shadow-lg hover:opacity-90 transition-opacity"
                        isDisabled={!roomId}
                    >
                        Join Now
                    </Button>
                </div>

                {/* ── Right: room info panel ── */}
                <div className="flex flex-col justify-center items-start gap-6 p-8 md:w-80 bg-[#13131a] border-l border-white/5">
                    <div>
                        <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Meeting room</p>
                        <p className="text-white text-sm font-mono break-all">{roomId ?? "Generating…"}</p>
                    </div>

                    <div className="w-full">
                        <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Share invite link</p>
                        <div className="flex items-center gap-2 bg-[#1e1e2a] border border-white/10 rounded-xl px-3 py-2">
                            <p className="text-white/60 text-xs truncate flex-1">{meetingLink || "—"}</p>
                            <button
                                onClick={handleCopyLink}
                                className="text-white/50 hover:text-white transition-colors shrink-0"
                                title="Copy link"
                            >
                                <Copy size={16} className={copied ? "text-green-400" : ""} />
                            </button>
                        </div>
                        <p className="text-white/30 text-xs mt-2">
                            Share this link with others to join the same meeting.
                        </p>
                    </div>

                    <div className="w-full border-t border-white/5 pt-4">
                        <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Meeting type</p>
                        <div className="flex items-center gap-2 text-white/60 text-sm">
                            {groupId ? <Users size={16} /> : <Video size={16} />}
                            <span>{groupId ? "Group call" : "One-on-one call"}</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Page;
