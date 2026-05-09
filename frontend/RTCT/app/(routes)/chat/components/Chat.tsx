"use client";
import Image from "next/image";
import { Video } from "lucide-react";
import React from "react";
import { useRouter } from "next/navigation";

const Chat = ({ image, name, time, onClick, selected, notifications, chatId, chatType, otherUserId }: any) => {
    const router = useRouter();

    const handleVideoCall = (e: React.MouseEvent) => {
        e.stopPropagation(); // don't trigger the chat-select onClick
        const params = new URLSearchParams({ name });
        if (chatType === "group") {
            params.set("groupId", chatId);
        } else {
            params.set("userId", otherUserId ?? chatId);
        }
        router.push(`/meeting?${params.toString()}`);
    };

    return (
        <div
            className={`group flex items-center p-4 cursor-pointer transition duration-200 ease-in-out ${selected ? "bg-[#7731d8]" : "hover:bg-[#564977]"}`}
            onClick={onClick}
        >
            <Image
                src={image === "" ? "/userlogo.png" : image}
                alt="User"
                className="w-12 h-12 rounded-full object-cover object-center shrink-0"
                width={200}
                height={200}
            />
            <div className="ml-4 flex-grow min-w-0">
                <div className="text-gray-200 truncate">{name}</div>
                <div className="text-gray-400 text-sm truncate">{time}</div>
            </div>

            {/* Notification badge */}
            {notifications > 0 && (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs p-1 shrink-0 mr-2">
                    {notifications}
                </div>
            )}

            {/* Video call button – appears on hover of this row */}
            <button
                onClick={handleVideoCall}
                title="Start video call"
                className="shrink-0 p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
            >
                <Video size={18} />
            </button>
        </div>
    );
};

export default Chat;
