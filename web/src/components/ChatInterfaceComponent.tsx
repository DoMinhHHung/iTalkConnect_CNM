import React from "react";
import { FiVideo, FiFileText, FiX } from "../components/IconComponents";
import ConfirmDialog from "./ConfirmDialog";
import ReactDOM from "react-dom";

// Interfaces
export interface Message {
  _id: string;
  sender: string | User;
  receiver: string | User;
  content: string;
  createdAt: string;
  status?: "pending" | "sent" | "delivered" | "seen" | "failed";
  chatType?: "private" | "group";
  replyTo?: {
    _id: string;
    content: string;
    sender: string | User;
  };
  type?: "text" | "image" | "video" | "audio" | "file" | "system";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileThumbnail?: string;
  fileId?: string;
  expiryDate?: string;
  fileExpired?: boolean;
  isUnsent?: boolean;
  unsent?: boolean;
  reactions?: Record<string, string>;
  _tempId?: string;
  tempId?: string;
}

// Alias cho kiểu Message mới hơn có thể thay thế dần
export interface ChatMessage extends Message {}

export interface Friend {
  _id: string;
  name: string;
  avt?: string;
  isOnline?: boolean;
}

export interface User {
  _id: string;
  name?: string;
  avt?: string;
  email?: string;
}

export interface EmojiOption {
  emoji: string;
  label: string;
}

export interface MediaFile {
  _id: string;
  type: "image" | "video" | "audio" | "file";
  fileUrl: string;
  fileName: string;
  fileThumbnail?: string;
  createdAt: string;
  sender: string;
}

// Common emojis - Facebook-style reactions
export const commonEmojis: EmojiOption[] = [
  { emoji: "👍", label: "Thích" },
  { emoji: "❤️", label: "Yêu thích" },
  { emoji: "😂", label: "Haha" },
  { emoji: "😮", label: "Wow" },
  { emoji: "😢", label: "Buồn" },
  { emoji: "😡", label: "Phẫn nộ" },
  // Additional popular emojis
  { emoji: "🔥", label: "Lửa" },
  { emoji: "👏", label: "Vỗ tay" },
];

// Utility functions
export const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Render functions
export const renderMessageStatus = (
  status?: "pending" | "sent" | "delivered" | "seen" | "failed"
) => {
  if (!status) return null;

  switch (status) {
    case "pending":
      return <span className="message-status">Đang gửi...</span>;
    case "sent":
      return <span className="message-status">Đã gửi</span>;
    case "delivered":
      return <span className="message-status">Đã nhận</span>;
    case "seen":
      return <span className="message-status seen">Đã xem</span>;
    case "failed":
      return <span className="message-status failed">Lỗi gửi</span>;
    default:
      return null;
  }
};

// Map emoji keywords to actual emoji characters
const emojiMap = {
  // Common keywords
  "like": "👍",
  "love": "❤️",
  "heart": "❤️",
  "haha": "😂",
  "laugh": "😂",
  "joy": "😂",
  "wow": "😮",
  "surprised": "😮",
  "sad": "😢",
  "cry": "😢", 
  "crying": "😢",
  "angry": "😡",
  "fire": "🔥",
  "clap": "👏",
  
  // Mobile specific formats
  "thumbsup": "👍",
  "thumbs_up": "👍",
  "thumbs-up": "👍",
  
  // Fix for common object representation
  "[object object]": "👍"
};

// Function to convert any emoji format to standard emoji character
const normalizeEmoji = (value) => {
  if (!value) return null;
  
  // Simple check for common emoji characters
  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥'];
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (commonEmojis.includes(trimmedValue)) {
      return trimmedValue;
    }
  }
  
  // Convert known keywords to emoji
  const lowerValue = typeof value === 'string' ? value.toLowerCase() : '';
  if (emojiMap[lowerValue]) return emojiMap[lowerValue];
  
  // Check if it's an emoji object from mobile
  if (typeof value === 'object' && value !== null) {
    if (value.emoji && typeof value.emoji === 'string') {
      return value.emoji;
    }
    if (value.type && typeof value.type === 'string') {
      return emojiMap[value.type.toLowerCase()] || '👍';
    }
  }
  
  // Default fallback
  return '👍';
};

export const renderReactions = (message: Message) => {
  if (!message.reactions) return null;

  const reactionCount = typeof message.reactions === 'object' ? 
                        Object.keys(message.reactions).length : 0;
  if (reactionCount === 0) return null;

  // Tạo một đối tượng để đếm số lượng mỗi emoji
  const counts: { [emoji: string]: number } = {};
  
  try {
    console.log("Processing reactions:", JSON.stringify(message.reactions));
    
    // Format của reactions có thể là:
    // 1. Object với userId -> emoji (Web format)
    // 2. Object với emoji -> array of users (Server format)
    // 3. Array của objects {emoji, userId} (Mobile format)
    
    if (Array.isArray(message.reactions)) {
      // Format 3: Array của objects { emoji, userId }
      (message.reactions as any[]).forEach(item => {
        if (item) {
          const normalizedEmoji = normalizeEmoji(item.emoji);
          if (normalizedEmoji) {
            counts[normalizedEmoji] = (counts[normalizedEmoji] || 0) + 1;
          }
        }
      });
    } else {
      // Check if reactions is in Format 2 (server format with emoji keys)
      const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥'];
      const possiblyFormat2 = Object.keys(message.reactions).some(key => 
        commonEmojis.includes(key.trim())
      );
      
      if (possiblyFormat2) {
        // Format 2: Object với emoji -> array of users
        Object.entries(message.reactions).forEach(([emoji, users]) => {
          const normalizedEmoji = normalizeEmoji(emoji);
          if (normalizedEmoji) {
            if (Array.isArray(users)) {
              counts[normalizedEmoji] = users.length;
            } else if (users) {
              // Fallback
              counts[normalizedEmoji] = (counts[normalizedEmoji] || 0) + 1;
            }
          }
        });
      } else {
        // Format 1: Object với userId -> emoji/reaction object
        Object.entries(message.reactions).forEach(([userId, value]) => {
          const normalizedEmoji = normalizeEmoji(value);
          
          if (normalizedEmoji) {
            counts[normalizedEmoji] = (counts[normalizedEmoji] || 0) + 1;
          }
        });
      }
    }
    
    console.log("Processed emoji counts:", counts);
  } catch (err) {
    console.error("Error processing reactions:", err);
    return null;
  }

  return (
    <div className="message-reactions">
      {Object.entries(counts).map(([emoji, count]) => (
        <span
          key={emoji}
          className="reaction-bubble"
          title={`${count} người đã thả cảm xúc`}
        >
          <span className="emoji">{emoji}</span>
          {count > 1 && <span className="count">{count}</span>}
        </span>
      ))}
    </div>
  );
};

export const renderMessageContent = (
  message: Message,
  openMediaPreview: (message: Message) => void,
  handleDownloadFile: (message: Message) => void
) => {
  switch (message.type) {
    case "image":
      return (
        <div
          className="message-media"
          onClick={() => openMediaPreview(message)}
        >
          <img
            src={message.fileUrl}
            alt={message.fileName || "Image"}
            className="message-image"
            loading="lazy"
            onError={(e) => {
              // Fallback khi không load được ảnh
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.alt = "Không thể tải ảnh";
              target.style.height = "50px";
              target.style.width = "auto";
              target.style.opacity = "0.5";
            }}
          />
        </div>
      );
    case "video":
      return (
        <div
          className="message-media"
          onClick={() => openMediaPreview(message)}
        >
          <div className="video-thumbnail">
            {message.fileThumbnail ? (
              <img
                src={message.fileThumbnail}
                alt="Video thumbnail"
                onError={(e) => {
                  // Fallback khi không load được thumbnail
                  const target = e.target as HTMLImageElement;
                  target.onerror = null;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent) {
                    const iconDiv = document.createElement("div");
                    iconDiv.className = "video-icon";
                    iconDiv.innerHTML =
                      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='23 7 16 12 23 17 23 7'></polygon><rect x='1' y='5' width='15' height='14' rx='2' ry='2'></rect></svg>";
                    parent.appendChild(iconDiv);
                  }
                }}
              />
            ) : (
              <div className="video-icon">
                <FiVideo />
              </div>
            )}
            <div className="play-button">▶</div>
          </div>
        </div>
      );
    case "audio":
      return (
        <div className="message-audio">
          <audio controls>
            <source src={message.fileUrl} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    case "file":
      return (
        <div
          className="message-file simplified"
          onClick={() => handleDownloadFile(message)}
        >
          <div className="file-icon">
            <FiFileText />
          </div>
          <div className="message-file-info">
            <span className="message-file-name">{message.fileName}</span>
          </div>
        </div>
      );
    default:
      return message.content;
  }
};

// Components
export const FileInfo: React.FC<{ message: Message }> = ({ message }) => {
  if (message.fileId && message.expiryDate) {
    const expiryDate = new Date(message.expiryDate);
    const now = new Date();

    if (message.fileExpired) {
      return <div className="file-expired">File đã hết hạn và bị xóa</div>;
    }

    const daysLeft = Math.ceil(
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return (
      <div className="file-expiry-info">
        File này sẽ hết hạn trong {daysLeft} ngày
      </div>
    );
  }
  return null;
};

export const MediaPreview: React.FC<{
  mediaPreview: Message | null;
  closeMediaPreview: () => void;
}> = ({ mediaPreview, closeMediaPreview }) => {
  if (!mediaPreview) return null;

  return (
    <div className="media-preview-overlay" onClick={closeMediaPreview}>
      <div
        className="media-preview-container"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-preview" onClick={closeMediaPreview}>
          <FiX />
        </button>
        {mediaPreview.type === "image" && (
          <img
            src={mediaPreview.fileUrl}
            alt={mediaPreview.fileName || "Image"}
          />
        )}
        {mediaPreview.type === "video" && (
          <video controls autoPlay>
            <source src={mediaPreview.fileUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        )}
        {mediaPreview.type === "audio" && (
          <div className="audio-player-large">
            <h3>{mediaPreview.fileName}</h3>
            <audio controls autoPlay>
              <source src={mediaPreview.fileUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>
    </div>
  );
};

export const ReplyBar: React.FC<{
  replyToMessage: Message | null;
  friend: Friend | null;
  user: any;
  cancelReply: () => void;
}> = ({ replyToMessage, friend, user, cancelReply }) => {
  if (!replyToMessage) return null;

  return (
    <div className="reply-bar">
      <div className="reply-preview">
        <div className="reply-indicator"></div>
        <div className="reply-info">
          <span className="reply-to">
            Trả lời{" "}
            {replyToMessage.sender === user?._id
              ? "chính bạn"
              : friend?.name || "người dùng"}
          </span>
          <p className="reply-content-preview">{replyToMessage.content}</p>
        </div>
      </div>
      <button className="cancel-reply" onClick={cancelReply}>
        ✖️
      </button>
    </div>
  );
};

// Function để kiểm tra xem tin nhắn có phải của người dùng hiện tại không
export const isMessageFromCurrentUser = (message: Message, userId?: string) => {
  if (!userId) return false;

  return (
    message.sender === userId ||
    (typeof message.sender === "object" && message.sender._id === userId)
  );
};

// Hàm hiển thị thông báo xác nhận tùy chỉnh thay thế cho window.confirm
export const showConfirmDialog = (message: string): Promise<boolean> => {
  return new Promise((resolve) => {
    // Create a div to mount our dialog into
    const dialogRoot = document.createElement("div");
    dialogRoot.id = "confirm-dialog-root";
    document.body.appendChild(dialogRoot);

    // Function to clean up the dialog after it's closed
    const cleanupDialog = () => {
      ReactDOM.unmountComponentAtNode(dialogRoot);
      document.body.removeChild(dialogRoot);
    };

    // Render our custom dialog component
    ReactDOM.render(
      <ConfirmDialog
        message={message}
        isOpen={true}
        onConfirm={() => {
          resolve(true);
          cleanupDialog();
        }}
        onCancel={() => {
          resolve(false);
          cleanupDialog();
        }}
      />,
      dialogRoot
    );
  });
};
