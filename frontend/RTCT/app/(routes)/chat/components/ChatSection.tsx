"use client";
import React, { useEffect, useRef, useState } from "react";
import {
    CircleArrowLeft, Search, SendHorizontal, Smile,
    ImagePlus, File, Paperclip, Download, Trash2, X, Loader2
} from "lucide-react";
import { Button, Input, Tooltip } from "@nextui-org/react";
import { Input as InputComponent } from "@/components/ui/input";
import Image from "next/image";
import Fuse from "fuse.js";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { Label } from "@radix-ui/react-label";
import { toast } from "sonner";

/* ─────────────────────────────────────────────────────────── */
/* Helpers                                                      */
/* ─────────────────────────────────────────────────────────── */
function formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}, ${pad(date.getDate())}-${date.toLocaleString("default", { month: "short" })}-${date.getFullYear().toString().slice(-2)}`;
}

/** Read a File as a base64 data-URL string */
function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/* ─────────────────────────────────────────────────────────── */
/* Types                                                        */
/* ─────────────────────────────────────────────────────────── */
interface Attachment {
    /** "image" | "file" */
    type: "image" | "file";
    /** base64 data URL (for images) or file name (for files) */
    dataUrl: string;
    fileName: string;
    /** raw File object – kept only until we send */
    raw?: File;
}

/* ─────────────────────────────────────────────────────────── */
/* Component                                                    */
/* ─────────────────────────────────────────────────────────── */
const ChatSection = ({ user, onBack, chatData, draft, onDraftChange, onSend }: any) => {
    const [showEmoji, setShowEmoji] = useState(false);
    const [text, setText] = useState(draft);
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [filteredChats, setFilteredChats] = useState<any[]>([]);
    const [showToolTip, setShowToolTip] = useState(false);
    const [sending, setSending] = useState(false);

    /** The pending attachment (image or file) chosen by the user */
    const [attachment, setAttachment] = useState<Attachment | null>(null);

    const fuse = useRef<Fuse<unknown> | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const inputImgRef = useRef<HTMLInputElement>(null);
    const inputFileRef = useRef<HTMLInputElement>(null);

    /* ── sync draft text ── */
    useEffect(() => { setText(draft); }, [draft]);

    /* ── build Fuse index when chatData changes ── */
    useEffect(() => {
        if (chatData) {
            fuse.current = new Fuse(chatData[1], {
                keys: ["senderName", "content.text"],
                includeScore: true,
                threshold: 0.1,
            });
            setFilteredChats(chatData[1]);
        }
    }, [chatData]);

    /* ── scroll to bottom on new messages ── */
    useEffect(() => {
        const el = document.getElementById("msg");
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, [chatData]);

    /* ── close emoji / tooltip on outside click ── */
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setIsSearchVisible(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    /* ── Search ── */
    const handleSearchInputChange = () => {
        if (!searchRef.current?.value) { setFilteredChats(chatData[1]); return; }
        if (fuse.current) {
            setFilteredChats(fuse.current.search(searchRef.current.value).map((r: any) => r.item));
        }
    };

    /* ── Emoji ── */
    const addEmoji = (e: { unified: string }) => {
        const emoji = String.fromCodePoint(...e.unified.split("_").map((s: string) => parseInt("0x" + s, 16)));
        setText((t: string) => t + emoji);
        onDraftChange(chatData?.chatID, text + emoji);
    };

    /* ── File / Image pickers ── */
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            toast.error("Image too large (max 10 MB)");
            return;
        }
        const dataUrl = await readAsDataURL(file);
        setAttachment({ type: "image", dataUrl, fileName: file.name, raw: file });
        setShowToolTip(false);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            toast.error("File too large (max 10 MB)");
            return;
        }
        const dataUrl = await readAsDataURL(file);
        setAttachment({ type: "file", dataUrl, fileName: file.name, raw: file });
        setShowToolTip(false);
    };

    const clearAttachment = () => {
        setAttachment(null);
        if (inputImgRef.current) inputImgRef.current.value = "";
        if (inputFileRef.current) inputFileRef.current.value = "";
    };

    /* ── Send ── */
    const handleSend = async () => {
        if (!chatData) return;
        if (attachment) {
            setSending(true);
            try {
                // onSend is extended to accept { msgType, dataUrl, fileName } as third arg
                await onSend(chatData[0], text || "", attachment);
            } finally {
                setSending(false);
                clearAttachment();
                setText("");
                onDraftChange(chatData[0].id, "");
            }
        } else if (text.trim()) {
            onSend(chatData[0], text);
            setText("");
            onDraftChange(chatData[0].id, "");
        }
        inputRef.current?.focus();
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !attachment) {
            handleSend();
        }
    };

    /* ── Message bubble renderer ── */
    const renderBubbleContent = (chat: any) => {
        const { msgType, text: txt, dataUrl, fileName } = chat.content ?? {};
        if (msgType === "image" && dataUrl) {
            return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={dataUrl}
                    alt={fileName ?? "image"}
                    className="rounded-xl max-w-[18rem] sm:max-w-[22rem] object-cover cursor-pointer"
                    onClick={() => window.open(dataUrl, "_blank")}
                />
            );
        }
        if (msgType === "file" && dataUrl) {
            return (
                <div className="bg-[#1e2030] p-3 rounded-xl flex items-center gap-3 w-64">
                    <File size={28} className="shrink-0 text-purple-400" />
                    <p className="truncate text-sm flex-1">{fileName ?? "file"}</p>
                    <a href={dataUrl} download={fileName ?? "file"} onClick={e => e.stopPropagation()}>
                        <Download size={18} className="text-white/60 hover:text-white transition-colors" />
                    </a>
                </div>
            );
        }
        return <p className="break-words max-w-full inline-block h-auto text-base">{txt}</p>;
    };

    /* ── Chat message list ── */
    const renderMessages = (list: any[]) => list.map((chat: any, index: number) => (
        <div
            className={`flex ${user?.id === chat.senderID ? "justify-end" : "justify-start"} items-end w-full gap-2`}
            key={chat.id || index}
        >
            {user?.id !== chat.senderID && (
                <img
                    src={"/userlogo.png"}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover shrink-0 mb-1"
                />
            )}
            <div className={`flex flex-col gap-1 max-w-[75%] ${user?.id === chat.senderID ? "items-end" : "items-start"}`}>
                <p className="text-xs text-white/40 px-1">{chat.senderName}</p>
                <div className={`p-3 ${user?.id === chat.senderID ? "bg-[#3d2f6e]" : "bg-[#1e2030]"} rounded-2xl`}>
                    {renderBubbleContent(chat)}
                </div>
                <p className="text-[11px] text-white/30 px-1">{formatDate(new Date(chat.timestamp))}</p>
            </div>
        </div>
    ));

    const displayList = isSearchVisible ? filteredChats : (chatData?.[1] ?? []);

    return (
        <div className="w-full h-full justify-between flex flex-col bg-[#131217]">

            {/* ── Nav bar ── */}
            {chatData && (
                <div className="w-full h-16 flex items-center justify-between px-4 bg-black shrink-0">
                    <div className="flex items-center gap-3">
                        <button className="md:hidden" onClick={onBack}><CircleArrowLeft /></button>
                        <img
                            className="rounded-full w-10 h-10 object-cover"
                            src={chatData[0]?.image || "/userlogo.png"}
                            alt=""
                        />
                        <h2 className="font-semibold">{chatData[0]?.first_name} {chatData[0]?.last_name}</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        {isSearchVisible ? (
                            <Input
                                autoFocus
                                ref={searchRef}
                                classNames={{ inputWrapper: "rounded-full h-9 font-normal text-default-500", input: "text-sm" }}
                                placeholder="Search messages…"
                                size="sm"
                                type="search"
                                variant="underlined"
                                onChange={handleSearchInputChange}
                            />
                        ) : (
                            <button onClick={() => setIsSearchVisible(true)}><Search size={20} /></button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Message area ── */}
            <div
                id="msg"
                className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[--chatSectionBg]"
            >
                {!chatData ? (
                    <div className="w-full h-full flex justify-center items-center text-xl text-white/40">
                        Select a chat to start messaging!
                    </div>
                ) : displayList.length === 0 && isSearchVisible ? (
                    <div className="flex justify-center items-center text-white/40">No results found</div>
                ) : (
                    renderMessages(displayList)
                )}
            </div>

            {/* ── Input bar ── */}
            {chatData && (
                <div className="shrink-0 bg-[#131217]">

                    {/* Attachment preview strip */}
                    {attachment && (
                        <div className="w-full px-4 pt-3 pb-1">
                            <div className="relative inline-flex items-center gap-2 bg-[#1e2030] border border-white/10 rounded-2xl p-2 pr-3">
                                {attachment.type === "image" ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={attachment.dataUrl} alt="" className="w-16 h-16 object-cover rounded-xl" />
                                ) : (
                                    <div className="w-16 h-16 flex flex-col items-center justify-center bg-[#272A35] rounded-xl">
                                        <File size={24} className="text-purple-400" />
                                    </div>
                                )}
                                <div className="flex flex-col gap-0.5">
                                    <p className="text-sm text-white/80 max-w-[12rem] truncate">{attachment.fileName}</p>
                                    <p className="text-xs text-white/40">{attachment.type === "image" ? "Image" : "File"}</p>
                                </div>
                                <button
                                    onClick={clearAttachment}
                                    className="absolute -top-2 -right-2 bg-neutral-700 hover:bg-red-500 rounded-full p-0.5 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="w-full h-16 flex items-center gap-2 px-3 relative">
                        {/* Emoji */}
                        <button onClick={() => setShowEmoji(v => !v)}>
                            <Smile className="text-white/60 hover:text-white transition-colors" size={24} />
                        </button>
                        {showEmoji && (
                            <div className="absolute bottom-16 left-2 z-50">
                                <Picker data={data} emojiSize={20} emojiButtonSize={28} onEmojiSelect={addEmoji} maxFrequentRows={1} />
                            </div>
                        )}

                        {/* Attachment picker */}
                        <Tooltip
                            isOpen={showToolTip}
                            radius="lg"
                            className="p-2"
                            content={
                                <div className="flex flex-col items-start justify-center gap-3">
                                    <Label
                                        className="flex items-center gap-2 hover:text-purple-400 cursor-pointer text-sm"
                                        htmlFor="img-input"
                                        onClick={() => setShowToolTip(false)}
                                    >
                                        <ImagePlus size={20} /> Image
                                    </Label>
                                    <Label
                                        className="flex items-center gap-2 hover:text-purple-400 cursor-pointer text-sm"
                                        htmlFor="file-input"
                                        onClick={() => setShowToolTip(false)}
                                    >
                                        <File size={20} /> File
                                    </Label>
                                </div>
                            }
                        >
                            <button onClick={() => setShowToolTip(v => !v)}>
                                <Paperclip className="text-white/60 hover:text-purple-400 transition-colors" size={22} />
                            </button>
                        </Tooltip>

                        {/* Hidden file inputs */}
                        <InputComponent
                            ref={inputImgRef}
                            id="img-input"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageChange}
                        />
                        <InputComponent
                            ref={inputFileRef}
                            id="file-input"
                            type="file"
                            className="hidden"
                            onChange={handleFileChange}
                        />

                        {/* Text input */}
                        <Input
                            ref={inputRef}
                            autoFocus
                            value={text}
                            onChange={(e) => {
                                setText(e.target.value);
                                onDraftChange(chatData?.chatID, e.target.value);
                            }}
                            onKeyPress={handleKeyPress}
                            classNames={{
                                input: "text-base",
                                inputWrapper: "rounded-full",
                            }}
                            type="text"
                            placeholder={attachment ? "Add a caption (optional)…" : "Type a message…"}
                        />

                        {/* Send button */}
                        <button
                            className="shrink-0"
                            onClick={handleSend}
                            disabled={sending || (!text.trim() && !attachment)}
                        >
                            {sending
                                ? <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                                : <SendHorizontal className="bg-[--darkBtn] w-8 h-8 rounded-full p-1 hover:bg-purple-500 transition-colors disabled:opacity-40" />
                            }
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatSection;