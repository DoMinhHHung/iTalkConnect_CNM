import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "../redux/hooks";
import "../scss/ChatInterface.scss";
import {
  FiMoreVertical,
  FiSearch,
  FiArchive,
  FiTrash2,
  FiX,
  FiFileText,
  FiPaperclip,
  FiImage,
  FiVideo,
  FiMusic,
  FiSend,
} from "./IconComponents";
import { MdClose, MdSend } from "react-icons/md";
import ReactDOM from "react-dom";

import {
  Message,
  Friend,
  MediaFile,
  commonEmojis,
  formatTime,
  renderMessageStatus,
  renderReactions,
  renderMessageContent,
  FileInfo,
  MediaPreview,
  ReplyBar,
  isMessageFromCurrentUser,
  showConfirmDialog,
} from "./ChatInterfaceComponent";

import {
  incrementUnreadMessages,
  resetUnreadMessages,
} from "../redux/slices/messageSlice";
import {
  API_URL,
  API_ENDPOINT,
  SOCKET_URL,
  SOCKET_OPTIONS,
} from "../constants";

interface ChatInterfaceProps {
  overrideFriendId?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ overrideFriendId }) => {
  const params = useParams<{ friendId: string }>();
  // Use the override if provided, otherwise use the URL parameter
  const friendId = overrideFriendId || params.friendId;
  const { user } = useAppSelector((state) => state.auth);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [apiStatus, setApiStatus] = useState<{
    friendInfo: boolean;
    messages: boolean;
  }>({ friendInfo: false, messages: false });
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null
  );
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaPreview, setMediaPreview] = useState<Message | null>(null);

  // Thêm states cho menu tùy chọn và dialog
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [selectedMediaType, setSelectedMediaType] = useState<
    "all" | "image" | "video" | "audio" | "file"
  >("all");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteAllMessages, setDeleteAllMessages] = useState(false);

  const dispatch = useAppDispatch();

  // Hàm tìm kiếm tin nhắn
  const handleSearch = () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const results = messages.filter((message) =>
      message.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    setSearchResults(results);
  };

  // Hàm lấy tất cả media từ cuộc trò chuyện
  const fetchMediaFiles = () => {
    const media = messages
      .filter(
        (message) =>
          message.type &&
          ["image", "video", "audio", "file"].includes(message.type) &&
          message.fileUrl
      )
      .map((message) => ({
        _id: message._id,
        type: message.type as "image" | "video" | "audio" | "file",
        fileUrl: message.fileUrl || "",
        fileName: message.fileName || "Unnamed file",
        fileThumbnail: message.fileThumbnail,
        createdAt: message.createdAt,
        sender:
          typeof message.sender === "object"
            ? message.sender._id
            : message.sender,
      }));

    setMediaFiles(media);
  };

  // Hàm lọc media theo loại
  const filterMediaByType = (
    type: "all" | "image" | "video" | "audio" | "file"
  ) => {
    setSelectedMediaType(type);
  };

  // Hàm xóa cuộc trò chuyện
  const handleDeleteConversation = async () => {
    if (!socket || !user || !friendId) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API_ENDPOINT}/chat/conversation/${user._id}/${friendId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (deleteAllMessages) {
        socket.emit("deleteConversation", {
          senderId: user._id,
          receiverId: friendId,
        });
      }

      setMessages([]);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  // Hàm xử lý thu hồi tin nhắn
  const handleUnsendMessage = async (message: Message) => {
    setSelectedMessage(message);

    // Custom confirm dialog cho thu hồi tin nhắn
    ReactDOM.render(
      <div className="custom-confirm-dialog">
        <div className="custom-confirm-content">
          <h3>Thu hồi tin nhắn</h3>
          <div className="options">
            <button
              onClick={() => {
                ReactDOM.unmountComponentAtNode(
                  document.getElementById("confirm-dialog-root") as HTMLElement
                );
                unsendMessage(message, true);
              }}
              className="primary"
            >
              Thu hồi tin nhắn với tất cả mọi người
            </button>
            <button
              onClick={() => {
                ReactDOM.unmountComponentAtNode(
                  document.getElementById("confirm-dialog-root") as HTMLElement
                );
                setSelectedMessage(null);
              }}
              className="cancel"
            >
              Hủy
            </button>
          </div>
        </div>
      </div>,
      document.getElementById("confirm-dialog-root") as HTMLElement
    );
  };

  // Hàm thực hiện thu hồi tin nhắn
  const unsendMessage = async (
    message: Message,
    forEveryone: boolean = true
  ) => {
    try {
      if (!socket || !user) return;

      // Cập nhật tin nhắn trong state trước để UI phản hồi ngay lập tức
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg._id === message._id
            ? {
                ...msg,
                content: "Tin nhắn đã bị thu hồi",
                unsent: true,
                isUnsent: true,
              }
            : msg
        )
      );

      // Gửi thông báo qua socket cho thu hồi với mọi người
      if (socket && friendId) {
        socket.emit("unsendMessage", {
          messageId: message._id,
          senderId: user._id,
          receiverId: friendId,
        });

        console.log("Emitted unsendMessage socket event:", {
          messageId: message._id,
          senderId: user._id,
          receiverId: friendId,
        });
      }

      // Gọi API để thu hồi tin nhắn
      const token = localStorage.getItem("token");
      await axios.put(
        `${API_ENDPOINT}/chat/message/${message._id}/unsend`,
        { forEveryone: true },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    } catch (error) {
      console.error("Error unsending message:", error);
      // Khôi phục tin nhắn nếu có lỗi
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg._id === message._id
            ? { ...message } // Khôi phục lại tin nhắn gốc
            : msg
        )
      );
      alert("Không thể thu hồi tin nhắn. Vui lòng thử lại.");
    } finally {
      setSelectedMessage(null);
    }
  };

  // Hàm xử lý xóa tin nhắn chỉ với người dùng hiện tại
  const handleDeleteForMe = async (message: Message) => {
    try {
      if (!socket || !user) return;

      // Cập nhật tin nhắn trong state trước để UI phản hồi ngay lập tức
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg._id !== message._id)
      );

      // Gửi yêu cầu ẩn tin nhắn qua socket
      socket.emit("hideMessage", {
        messageId: message._id,
      });

      console.log("Emitted hideMessage socket event:", {
        messageId: message._id,
      });

      // Đóng menu tương tác nếu đang mở
      setSelectedMessage(null);
    } catch (error) {
      console.error("Error deleting message:", error);
      alert("Không thể xóa tin nhắn. Vui lòng thử lại.");
    }
  };

  // Khởi tạo socket
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !user) return;

    console.log("Khởi tạo kết nối socket mới");

    // Khởi tạo socket với địa chỉ server
    const newSocket = io(SOCKET_URL, {
      auth: {
        token,
      },
      ...SOCKET_OPTIONS,
    });

    setSocket(newSocket);

    // Xử lý kết nối và lỗi
    newSocket.on("connect", () => {
      console.log("Socket đã kết nối thành công với ID:", newSocket.id);

      // Tham gia phòng người dùng
      newSocket.on("messageUnsent", (data) => {
        console.log("Received messageUnsent event:", data);
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg._id === data.messageId
              ? {
                  ...msg,
                  content: "Tin nhắn đã bị thu hồi",
                  unsent: true,
                  isUnsent: true,
                }
              : msg
          )
        );
      });

      // Lắng nghe sự kiện reaction từ người dùng khác
      newSocket.on("messageReaction", (data) => {
        console.log("Received messageReaction event:", data);

        try {
          // Log toàn bộ cấu trúc dữ liệu để debug
          console.log("Reaction data structure:", JSON.stringify(data));

          // Ensure we have all required fields
          const messageId = data.messageId;
          const userId = data.userId || data.senderId; // Handle both formats
          const emoji = data.emoji;

          // Kiểm tra null/undefined
          if (!messageId || !userId) {
            console.error("Missing messageId or userId in reaction data");
            return;
          }

          // Normalize emoji format
          const normalizedEmoji = normalizeEmoji(emoji);

          // Cập nhật reactions trong state messages
          setMessages((prevMessages) =>
            prevMessages.map((msg) => {
              if (msg._id === messageId) {
                // If the server provided a complete reactions object, use that
                if (data.reactions && typeof data.reactions === "object") {
                  console.log("Using server-provided reactions map");
                  return {
                    ...msg,
                    reactions: data.reactions,
                  };
                }

                // Otherwise, update only the specific reaction
                const updatedReactions = { ...(msg.reactions || {}) };

                // Empty emoji means remove reaction
                if (!emoji || emoji === "") {
                  if (updatedReactions[userId]) {
                    delete updatedReactions[userId];
                    console.log(`Removed reaction from user ${userId}`);
                  }
                }
                // Otherwise add/update the reaction
                else {
                  updatedReactions[userId] = normalizedEmoji;
                  console.log(
                    `Added reaction ${normalizedEmoji} for user ${userId}`
                  );
                }

                return {
                  ...msg,
                  reactions: updatedReactions,
                };
              }
              return msg;
            })
          );
        } catch (error) {
          console.error("Error processing reaction event:", error);
        }
      });

      // Also listen for 'reaction' events for maximum compatibility
      newSocket.on("reaction", (data) => {
        console.log("Received 'reaction' event:", data);
        // Forward to messageReaction handler for unified processing
        newSocket.emit("messageReaction", data);
      });

      // Lắng nghe sự kiện xóa tin nhắn chỉ với người dùng hiện tại
      newSocket.on("messageHidden", (data) => {
        console.log("Received messageHidden event:", data);
        if (data && data.messageId) {
          setMessages((prevMessages) =>
            prevMessages.filter((msg) => msg._id !== data.messageId)
          );
        }
      });

      // Tham gia phòng người dùng
      newSocket.emit("joinUserRoom", { userId: user._id });
      console.log("Đã tham gia phòng người dùng:", user._id);

      if (friendId) {
        // Tạo room ID dựa trên ID người dùng và người nhận (đảm bảo cùng một room giữa web và mobile)
        const sortedIds = [user._id, friendId].sort();
        const roomId = `${sortedIds[0]}_${sortedIds[1]}`;

        // Tham gia phòng chat cụ thể
        newSocket.emit("joinRoom", { roomId });
        console.log("Đã tham gia phòng chat:", roomId);

        // Tham gia phòng trực tiếp (cho tương thích với mobile)
        newSocket.emit("joinDirectRoom", {
          sender: user._id,
          receiver: friendId,
        });
        console.log("Đã tham gia phòng chat trực tiếp:", {
          sender: user._id,
          receiver: friendId,
        });

        // Request missed messages
        console.log("Requesting missed messages for room:", roomId);
        newSocket.emit("requestMissedMessages", {
          roomId: roomId,
          isGroup: false,
        });
      }
    });

    newSocket.on("connect_error", (error) => {
      console.error("Lỗi kết nối socket:", error);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket bị ngắt kết nối:", reason);
    });

    // Thêm handler cho tin nhắn mới - cải thiện xử lý trùng lặp tin nhắn
    newSocket.on("message", (data) => {
      console.log("Nhận tin nhắn mới:", data);

      // Kiểm tra xem đã có tin nhắn với ID hoặc tempId tương tự chưa
      setMessages((prevMessages) => {
        const isDuplicate = prevMessages.some(
          (msg) =>
            (data._id && msg._id === data._id) ||
            (data.tempId && msg._id === data.tempId) ||
            (msg.tempId && data._id && msg.tempId === data._id)
        );

        if (isDuplicate) {
          console.log("Bỏ qua tin nhắn trùng lặp:", data._id || data.tempId);
          return prevMessages;
        }

        // Xử lý tin nhắn tạm thời trong danh sách tin nhắn
        if (data.tempId) {
          const updatedMessages = prevMessages.map((msg) =>
            msg._id === data.tempId ? { ...data, _id: data._id } : msg
          );

          // Nếu không có thay đổi (không tìm thấy tempId), thêm tin nhắn mới
          if (
            JSON.stringify(updatedMessages) === JSON.stringify(prevMessages)
          ) {
            return [...prevMessages, data];
          }

          return updatedMessages;
        }

        return [...prevMessages, data];
      });

      // Cập nhật trạng thái tin nhắn thành "seen" nếu là người nhận
      if (data.sender !== user._id && socket) {
        socket.emit("messageRead", {
          messageId: data._id,
          sender: data.sender,
          receiver: user._id,
        });
      }
    });

    return () => {
      console.log("Dọn dẹp kết nối socket");
      if (newSocket) {
        // Rời khỏi các phòng
        if (friendId) {
          const sortedIds = [user._id, friendId].sort();
          const roomId = `${sortedIds[0]}_${sortedIds[1]}`;
          newSocket.emit("leaveRoom", { roomId });
        }
        newSocket.disconnect();
      }
    };
  }, [friendId, user, dispatch]);

  // Thêm cơ chế polling định kỳ để làm dự phòng
  useEffect(() => {
    if (!friendId || !user) return;

    // Khởi tạo interval để poll tin nhắn mới mỗi 5 giây
    const intervalId = setInterval(async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        // Lấy tin nhắn mới nhất từ server
        const response = await axios.get(
          `${API_ENDPOINT}/chat/messages/${user._id}/${friendId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        // Nếu có tin nhắn mới, cập nhật state
        if (response.data && response.data.length > 0) {
          // So sánh với tin nhắn hiện có để chỉ thêm tin nhắn mới
          setMessages((currentMessages) => {
            const existingIds = new Set(currentMessages.map((msg) => msg._id));
            const newMessages = response.data.filter(
              (msg: Message) => !existingIds.has(msg._id)
            );

            if (newMessages.length > 0) {
              console.log(
                `Tìm thấy ${newMessages.length} tin nhắn mới qua polling`
              );
              return [...currentMessages, ...newMessages];
            }

            return currentMessages;
          });
        }
      } catch (error) {
        console.error("Lỗi khi poll tin nhắn mới:", error);
      }
    }, 5000); // Poll mỗi 5 giây

    // Dọn dẹp interval khi component unmount
    return () => clearInterval(intervalId);
  }, [friendId, user]);

  // Scroll đến tin nhắn mới
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Lấy thông tin người dùng và tin nhắn
  useEffect(() => {
    if (!friendId || !user) return;

    const fetchFriendInfo = async () => {
      try {
        const token = localStorage.getItem("token");
        setLoading(true);
        setError(null);

        console.log(`Đang lấy thông tin người dùng: ${friendId}`);

        try {
          const friendResponse = await axios.get(
            `https://italkconnect-v3.onrender.com/api/auth/${friendId}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          console.log("Thông tin người dùng nhận được:", friendResponse.data);

          if (friendResponse.data) {
            setFriend(friendResponse.data);
            setApiStatus((prev) => ({ ...prev, friendInfo: true }));
          }
        } catch (friendErr: any) {
          console.error("Lỗi khi lấy thông tin người dùng:", friendErr);

          // Thử với endpoint dự phòng
          try {
            console.log("Thử với endpoint dự phòng...");
            const backupResponse = await axios.get(
              `https://italkconnect-v3.onrender.com/api/auth/search/${friendId}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );

            if (backupResponse.data) {
              setFriend(backupResponse.data);
              setApiStatus((prev) => ({ ...prev, friendInfo: true }));
            }
          } catch (backupErr) {
            console.error("Endpoint dự phòng cũng thất bại:", backupErr);
            // Sử dụng ID để tạm thời hiển thị
            if (friendId) {
              const shortId = friendId.substring(0, 8);
              setFriend({
                _id: friendId,
                name: `Người dùng ${shortId}...`,
              });
            }

            setError(
              "Không thể tải thông tin người dùng. Vui lòng làm mới trang."
            );
          }
        }

        // Lấy tin nhắn bất kể có lấy được thông tin người dùng hay không
        try {
          console.log(`Đang lấy tin nhắn giữa ${user._id} và ${friendId}`);
          const messagesResponse = await axios.get(
            `https://italkconnect-v3.onrender.com/api/chat/messages/${user._id}/${friendId}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          console.log("Tin nhắn nhận được:", messagesResponse.data);
          setMessages(messagesResponse.data || []);
          setApiStatus((prev) => ({ ...prev, messages: true }));
        } catch (messagesErr: any) {
          console.error("Lỗi khi lấy tin nhắn:", messagesErr);
          setMessages([]);
        }

        setLoading(false);
      } catch (err: any) {
        console.error("Lỗi tổng thể:", err);
        setError("Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.");
        setLoading(false);
      }
    };

    fetchFriendInfo();
  }, [friendId, user]);

  // Thêm xử lý đang nhập
  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    // Thông báo đang nhập
    if (socket && user && friendId) {
      // Xóa timeout cũ nếu có
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }

      // Gửi sự kiện đang nhập
      socket.emit("typing", {
        sender: user._id,
        receiver: friendId,
      });

      // Đặt timeout mới để thông báo ngừng nhập sau 2 giây
      const timeout = setTimeout(() => {
        if (socket) {
          socket.emit("stopTyping", {
            sender: user._id,
            receiver: friendId,
          });
        }
      }, 2000);

      setTypingTimeout(timeout);
    }
  };

  // Hàm gửi tin nhắn
  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isUploading) return;

    // Nếu chỉ gửi text
    if (!newMessage.trim() || !user || !friendId) return;
    // ...phần gửi text như cũ...
    // Hủy sự kiện đang nhập
    if (socket) {
      socket.emit("stopTyping", {
        sender: user._id,
        receiver: friendId,
      });
    }
    const tempId = Date.now().toString();
    const sortedIds = [user._id, friendId].sort();
    const roomId = `${sortedIds[0]}_${sortedIds[1]}`;
    const tempMessage: Message = {
      _id: tempId,
      sender: user._id,
      receiver: friendId,
      content: newMessage,
      createdAt: new Date().toISOString(),
      status: "pending",
      chatType: "private",
      ...(replyToMessage
        ? {
            replyTo: {
              _id: replyToMessage._id,
              content: replyToMessage.content,
              sender: replyToMessage.sender,
            },
          }
        : {}),
    };
    setMessages((prev) => [...prev, tempMessage]);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API_ENDPOINT}/chat/messages`,
        {
          roomId,
          content: newMessage,
          receiver: friendId,
          tempId,
          ...(replyToMessage ? { replyToId: replyToMessage._id } : {}),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (response.data && response.data._id) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === tempId ? { ...response.data, status: "sent" } : msg
          )
        );
        if (socket) {
          socket.emit("notifyNewMessage", {
            messageId: response.data._id,
            sender: user._id,
            receiver: friendId,
            roomId,
            tempId,
            type: "text",
          });
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === tempId ? { ...msg, status: "failed" } : msg
        )
      );
      setError("Không thể gửi tin nhắn. Vui lòng thử lại sau.");
      setTimeout(() => setError(null), 3000);
    }
    setNewMessage("");
    setReplyToMessage(null);
    setIsReplying(false);
  };

  // Thêm hàm upload file custom
  const handleFileUploadCustom = async (file: File, type: string) => {
    if (!file || !user || !friendId) return;
    const tempId = Date.now().toString();
    try {
      setIsUploading(true);
      setUploadProgress(0);
      let fileType: "image" | "video" | "audio" | "file" = "file";
      if (type === "image") fileType = "image";
      else if (type === "video") fileType = "video";
      else if (type === "audio") fileType = "audio";
      const token = localStorage.getItem("token");
      if (!token) return;
      const sortedIds = [user._id, friendId].sort();
      const roomId = `${sortedIds[0]}_${sortedIds[1]}`;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", fileType);
      formData.append("senderId", user._id);
      formData.append("receiverId", friendId);
      formData.append("roomId", roomId);
      formData.append("tempId", tempId);
      if (replyToMessage) {
        formData.append("replyToId", replyToMessage._id);
      }

      // Add temporary message to UI immediately
      setMessages((prev) => [
        ...prev,
        {
          _id: tempId,
          content: file.name,
          sender: user,
          receiver: { _id: friendId },
          createdAt: new Date().toISOString(),
          type: fileType,
          fileUrl: "",
          fileName: file.name,
          fileSize: file.size,
          status: "pending",
          tempId: tempId,
        },
      ]);

      // Upload file
      const response = await axios.post(
        `${API_ENDPOINT}/chat/upload-cloudinary`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              setUploadProgress(percentCompleted);
            }
          },
        }
      );

      const fileData = response.data.file || response.data;
      console.log("File uploaded successfully:", fileData);

      // Update the message in UI with file URL
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === tempId
            ? {
                ...msg,
                fileUrl: fileData.fileUrl,
                status: "sent",
              }
            : msg
        )
      );

      // Send via socket first
      let messageSent = false;
      if (socket && socket.connected) {
        try {
          console.log("Socket connected, sending file message via socket");
          const messageData = {
            sender: user._id,
            receiver: friendId,
            roomId: roomId,
            content: file.name,
            type: fileType,
            fileUrl: fileData.fileUrl,
            fileName: file.name,
            fileSize: file.size,
            tempId: tempId,
          };

          // Emit both message formats for compatibility
          socket.emit("privateMessage", messageData);
          socket.emit("message", {
            ...messageData,
            room: roomId,
          });

          messageSent = true;
          console.log("File message sent via socket");
        } catch (socketError) {
          console.error("Error sending via socket:", socketError);
        }
      } else {
        console.log("Socket not connected, using API fallback");
      }

      // Only use API as fallback if socket failed
      if (!messageSent) {
        try {
          const apiResponse = await axios.post(
            `${API_ENDPOINT}/chat/message`,
            {
              senderId: user._id,
              receiverId: friendId,
              content: file.name,
              type: fileType,
              fileUrl: fileData.fileUrl,
              fileName: file.name,
              fileSize: file.size,
              roomId: roomId,
              tempId: tempId,
              replyToId: replyToMessage?._id,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          console.log("File message sent via API:", apiResponse.data);
        } catch (apiError) {
          console.error("API fallback failed:", apiError);
          setMessages((prev) =>
            prev.map((msg) =>
              msg._id === tempId ? { ...msg, status: "failed" } : msg
            )
          );
          setError("Không thể gửi tệp tin. Vui lòng thử lại sau.");
          setTimeout(() => setError(null), 3000);
        }
      }

      // Reset state
      setReplyToMessage(null);
      setIsReplying(false);
    } catch (error) {
      console.error("Error handling file upload:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === tempId ? { ...msg, status: "failed" } : msg
        )
      );
      setError("Không thể tải lên tệp tin. Vui lòng thử lại sau.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Thêm useEffect để đánh dấu tin nhắn đã đọc
  useEffect(() => {
    // Kiểm tra xem có tin nhắn chưa đọc từ người khác không
    if (socket && messages.length > 0 && friendId && user) {
      const unreadMessages = messages.filter((msg) => {
        const senderId =
          typeof msg.sender === "object" ? msg.sender._id : msg.sender;
        return senderId === friendId && msg.status !== "seen";
      });

      if (unreadMessages.length > 0) {
        // Đánh dấu tất cả là đã đọc
        unreadMessages.forEach((msg) => {
          socket.emit("messageRead", {
            messageId: msg._id,
            sender:
              typeof msg.sender === "object" ? msg.sender._id : msg.sender,
            receiver: user._id,
          });
        });

        // Cập nhật trạng thái tin nhắn trong state
        setMessages((prevMessages) =>
          prevMessages.map((msg) => {
            const senderId =
              typeof msg.sender === "object" ? msg.sender._id : msg.sender;
            return senderId === friendId && msg.status !== "seen"
              ? { ...msg, status: "seen" }
              : msg;
          })
        );
      }
    }
  }, [messages, socket, friendId, user]);

  // Xử lý long press để hiển thị menu
  const handleLongPress = (message: Message) => {
    if (selectedMessage && selectedMessage._id === message._id) {
      setSelectedMessage(null);
      setShowEmojiPicker(false);
    } else {
      setSelectedMessage(message);
      setShowEmojiPicker(false);
    }
  };

  // Mở bảng emoji
  const openEmojiPicker = (message: Message) => {
    setSelectedMessage(message);
    setShowEmojiPicker(true);
  };

  // Xử lý thả emoji cho tin nhắn
  const handleReaction = async (emoji: string) => {
    if (!selectedMessage || !user) return;

    try {
      console.log("Adding reaction:", {
        messageId: selectedMessage._id,
        userId: user._id,
        emoji: emoji,
      });

      // Lưu trạng thái reactions ban đầu để khôi phục nếu có lỗi
      const originalMessage = messages.find(
        (m) => m._id === selectedMessage._id
      );
      const originalReactions = originalMessage?.reactions || {};

      // Kiểm tra xem có đang toggle reaction không - so sánh chính xác chuỗi emoji
      const isTogglingOff =
        originalReactions && originalReactions[user._id] === emoji;

      // Emoji rỗng khi toggle off, nguyên bản khi toggle on
      const finalEmoji = isTogglingOff ? "" : emoji;

      console.log(
        `${
          isTogglingOff ? "Removing" : "Adding"
        } reaction '${emoji}' for message ${selectedMessage._id}`
      );

      // Cập nhật UI ngay lập tức (optimistic update)
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg._id === selectedMessage._id) {
            const updatedReactions = { ...(msg.reactions || {}) };

            // Toggle reaction (thêm nếu chưa có, xóa nếu đã có)
            if (isTogglingOff) {
              delete updatedReactions[user._id];
              console.log(`Removed user ${user._id}'s reaction from UI`);
            } else {
              updatedReactions[user._id] = emoji;
              console.log(`Added ${emoji} reaction for user ${user._id} to UI`);
            }

            return {
              ...msg,
              reactions: updatedReactions,
            };
          }
          return msg;
        })
      );

      // Đóng menu trước khi gửi request để UI phản hồi nhanh
      setSelectedMessage(null);
      setShowEmojiPicker(false);

      // Thử gửi qua socket trước
      let success = false;
      if (socket && socket.connected) {
        try {
          // Make sure emoji is a simple string, not an object
          const cleanEmoji =
            typeof finalEmoji === "object"
              ? (finalEmoji as any).emoji || ""
              : finalEmoji;

          // Chuẩn bị dữ liệu để gửi qua socket
          const reactionData = {
            messageId: selectedMessage._id,
            userId: user._id,
            emoji: cleanEmoji, // Emoji rỗng khi xóa reaction
          };

          console.log(
            "Sending addReaction event via socket with data:",
            reactionData
          );

          // Ensure emoji is sent in the correct format
          socket.emit("addReaction", reactionData);

          success = true;
          console.log("Reaction sent successfully via socket");
        } catch (socketError) {
          console.error("Error sending reaction via socket:", socketError);
        }
      }

      // Fallback: gọi API nếu socket không hoạt động hoặc gặp lỗi
      if (!success) {
        console.log("Using API fallback for reaction");
        const token = localStorage.getItem("token");
        await axios.post(
          `${API_ENDPOINT}/chat/messages/${selectedMessage._id}/reactions`,
          { emoji: finalEmoji },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        console.log("Reaction sent successfully via API");
      }
    } catch (error) {
      console.error("Error sending reaction:", error);

      // Khôi phục UI nếu có lỗi
      const originalMessage = messages.find(
        (m) => m._id === selectedMessage._id
      );
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg._id === selectedMessage?._id) {
            return { ...msg, reactions: originalMessage?.reactions || {} };
          }
          return msg;
        })
      );

      // Hiển thị thông báo lỗi ngắn
      alert("Could not send reaction. Please try again.");
    }
  };

  // Xử lý trả lời tin nhắn
  const handleReply = (message: Message) => {
    setReplyToMessage(message);
    setIsReplying(true);
    // Focus vào input
    const input = document.querySelector(
      ".message-form input"
    ) as HTMLInputElement;
    if (input) input.focus();
  };

  // Hủy trả lời
  const cancelReply = () => {
    setReplyToMessage(null);
    setIsReplying(false);
  };

  // Xử lý hiển thị menu đính kèm file
  const toggleAttachMenu = () => {
    setShowAttachMenu((prev) => !prev);
  };

  // Xử lý khi click vào nút chọn loại file
  const handleFileTypeSelect = (type: "image" | "video" | "audio" | "file") => {
    if (fileInputRef.current) {
      // Đặt accept attribute dựa trên loại file
      switch (type) {
        case "image":
          fileInputRef.current.accept = "image/*";
          break;
        case "video":
          fileInputRef.current.accept = "video/*";
          break;
        case "audio":
          fileInputRef.current.accept = "audio/*";
          break;
        case "file":
          fileInputRef.current.accept =
            ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
          break;
      }
      fileInputRef.current.click();
    }
    setShowAttachMenu(false);
  };

  // Đưa handleFileUpload ra ngoài để truyền vào AttachmentMenu
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    user,
    friendId,
    replyToMessage,
    setMessages,
    setIsUploading,
    setUploadProgress,
    setReplyToMessage,
    setIsReplying,
    socket
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user || !friendId) return;
    const tempId = Date.now().toString();
    try {
      setIsUploading(true);
      setUploadProgress(0);
      let fileType: "image" | "video" | "audio" | "file" = "file";
      if (file.type.startsWith("image/")) fileType = "image";
      else if (file.type.startsWith("video/")) fileType = "video";
      else if (file.type.startsWith("audio/")) fileType = "audio";
      const token = localStorage.getItem("token");
      if (!token) return;
      const sortedIds = [user._id, friendId].sort();
      const roomId = `${sortedIds[0]}_${sortedIds[1]}`;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", fileType);
      formData.append("senderId", user._id);
      formData.append("receiverId", friendId);
      formData.append("roomId", roomId);
      formData.append("tempId", tempId);
      if (replyToMessage) {
        formData.append("replyToId", replyToMessage._id);
      }
      setMessages((prev) => [
        ...prev,
        {
          _id: tempId,
          sender: user._id,
          receiver: friendId,
          content: file.name,
          createdAt: new Date().toISOString(),
          status: "pending",
          chatType: "private",
          type: fileType,
          fileName: file.name,
          fileSize: file.size,
          ...(replyToMessage
            ? {
                replyTo: {
                  _id: replyToMessage._id,
                  content: replyToMessage.content,
                  sender: replyToMessage.sender,
                },
              }
            : {}),
        },
      ]);
      let response;
      let fileData;
      try {
        response = await axios.post(
          `${API_ENDPOINT}/chat/upload-cloudinary`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
              Authorization: `Bearer ${token}`,
            },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percentCompleted = Math.round(
                  (progressEvent.loaded * 100) / progressEvent.total
                );
                setUploadProgress(percentCompleted);
              }
            },
          }
        );
        fileData = response.data.file || response.data;
      } catch (cloudError) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === tempId ? { ...msg, status: "failed" } : msg
          )
        );
        alert("Lỗi: Không thể tải lên file. Vui lòng thử lại.");
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }
      // Sau khi upload file thành công, gọi tiếp API lưu message
      let savedMessage: any = null;
      try {
        const sortedIds = [user._id, friendId].sort();
        const roomId = `${sortedIds[0]}_${sortedIds[1]}`;
        const messagePayload = {
          roomId,
          content: fileData.fileName || file.name,
          receiver: friendId,
          tempId,
          type: fileType,
          fileUrl: fileData.fileUrl,
          fileName: fileData.fileName || file.name,
          fileSize: fileData.fileSize || file.size,
          fileThumbnail: fileData.fileThumbnail,
          fileId: fileData.fileId,
          ...(replyToMessage ? { replyToId: replyToMessage._id } : {}),
        };
        const saveRes = await axios.post(
          `${API_ENDPOINT}/chat/messages`,
          messagePayload,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        savedMessage = saveRes.data;
      } catch (saveError) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === tempId ? { ...msg, status: "failed" } : msg
          )
        );
        alert("Lỗi: Không thể lưu tin nhắn file. Vui lòng thử lại.");
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === tempId
            ? {
                ...savedMessage,
                status: "sent",
              }
            : msg
        )
      );
      if (socket && (savedMessage?._id || savedMessage?.fileId)) {
        socket.emit("sendGroupMessage", {
          _id: savedMessage._id,
          sender: user._id,
          groupId: friendId,
          roomId: `group:${friendId}`,
          content: savedMessage.fileName || file.name,
          type: fileType,
          fileUrl: savedMessage.fileUrl,
          fileName: savedMessage.fileName || file.name,
          fileSize: savedMessage.fileSize || file.size,
          fileThumbnail: savedMessage.fileThumbnail,
          fileId: savedMessage.fileId,
          chatType: "group",
          createdAt: savedMessage.createdAt,
        });
      }
      setReplyToMessage(null);
      setIsReplying(false);
      e.target.value = "";
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === tempId ? { ...msg, status: "failed" } : msg
        )
      );
      alert("Lỗi: Không thể tải lên file. Vui lòng thử lại.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Mở media preview
  const openMediaPreview = (message: Message) => {
    if (message.type && ["image", "video", "audio"].includes(message.type)) {
      setMediaPreview(message);
    }
  };

  // Đóng media preview
  const closeMediaPreview = () => {
    setMediaPreview(null);
  };

  // Xử lý tải file
  const handleDownloadFile = (message: Message) => {
    if (message.fileUrl) {
      window.open(message.fileUrl, "_blank");
    }
  };

  // Thêm đoạn code sau trong useEffect khi component mount
  useEffect(() => {
    // Reset counter tin nhắn cá nhân khi vào trang chat
    dispatch(resetUnreadMessages());
  }, [dispatch]);

  // Thêm hàm wrapper để xử lý upload file
  const handleFileUploadWrapper = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(
      e,
      user,
      friendId,
      replyToMessage,
      setMessages,
      setIsUploading,
      setUploadProgress,
      setReplyToMessage,
      setIsReplying,
      socket
    );
  };

  // Hàm chuẩn hóa emoji từ nhiều định dạng khác nhau
  const normalizeEmoji = (emoji: any): string => {
    if (!emoji) return "👍"; // Default emoji

    // Mapping các giá trị emoji thông thường
    const emojiMap: { [key: string]: string } = {
      like: "👍",
      love: "❤️",
      haha: "😂",
      wow: "😮",
      sad: "😢",
      angry: "😡",
      fire: "🔥",
      clap: "👏",
      thumbsup: "👍",
      thumbs_up: "👍",
      "thumbs-up": "👍",
    };

    // Nếu là chuỗi, kiểm tra xem có trong map không
    if (typeof emoji === "string") {
      const lowerEmoji = emoji.toLowerCase().trim();
      return emojiMap[lowerEmoji] || emoji;
    }

    // Nếu là object, thử lấy từ thuộc tính emoji
    if (typeof emoji === "object" && emoji !== null) {
      if (emoji.emoji && typeof emoji.emoji === "string") {
        return emoji.emoji;
      }
      if (emoji.type && typeof emoji.type === "string") {
        return emojiMap[emoji.type.toLowerCase()] || emoji.type;
      }
    }

    return "👍"; // Mặc định nếu không nhận dạng được
  };

  if (loading) {
    return <div className="chat-loading">Đang tải cuộc trò chuyện...</div>;
  }

  if (!friend) {
    return (
      <div className="chat-error">Không tìm thấy thông tin người dùng</div>
    );
  }

  const isFriendOnline = friendId ? onlineUsers.has(friendId) : false;

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <div className="avatar">
          {friend.avt ? (
            <img src={friend.avt} alt={friend.name} />
          ) : (
            <div className="avatar-placeholder">
              {friend.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="user-info">
          <h3>{friend.name}</h3>
          <span className={`status ${isFriendOnline ? "online" : "offline"}`}>
            {isFriendOnline ? "Đang hoạt động" : "Ngoại tuyến"}
          </span>
        </div>
        <div className="more-options">
          <button
            className="more-options-button"
            onClick={() => setShowMoreOptions((prev) => !prev)}
          >
            <FiMoreVertical />
          </button>
          {showMoreOptions && (
            <div className="more-options-menu">
              <button
                className="option-button"
                onClick={() => setShowSearchDialog(true)}
              >
                <FiSearch /> Tìm kiếm tin nhắn
              </button>
              <button
                className="option-button"
                onClick={() => {
                  fetchMediaFiles();
                  setShowMediaGallery(true);
                }}
              >
                <FiArchive /> Xem media
              </button>
              <button
                className="option-button"
                onClick={() => setShowDeleteDialog(true)}
              >
                <FiTrash2 /> Xóa tin nhắn
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Dialog */}
      {showSearchDialog && (
        <div className="search-dialog">
          <div className="search-header">
            <h3>Tìm kiếm tin nhắn</h3>
            <button
              className="close-button"
              onClick={() => setShowSearchDialog(false)}
            >
              <FiX />
            </button>
          </div>
          <input
            type="text"
            placeholder="Nhập nội dung tìm kiếm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="search-button" onClick={handleSearch}>
            Tìm kiếm
          </button>
          <div className="search-results">
            {searchResults.length === 0 ? (
              <p>Không tìm thấy kết quả</p>
            ) : (
              searchResults.map((result) => (
                <div key={result._id} className="search-result-item">
                  <p>{result.content}</p>
                  <span>{new Date(result.createdAt).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Media Gallery */}
      {showMediaGallery && (
        <div className="media-gallery">
          <div className="gallery-header">
            <h3>Xem media</h3>
            <button
              className="close-button"
              onClick={() => setShowMediaGallery(false)}
            >
              <FiX />
            </button>
          </div>
          <div className="media-filters">
            <button
              className={`filter-button ${
                selectedMediaType === "all" ? "active" : ""
              }`}
              onClick={() => filterMediaByType("all")}
            >
              Tất cả
            </button>
            <button
              className={`filter-button ${
                selectedMediaType === "image" ? "active" : ""
              }`}
              onClick={() => filterMediaByType("image")}
            >
              Hình ảnh
            </button>
            <button
              className={`filter-button ${
                selectedMediaType === "video" ? "active" : ""
              }`}
              onClick={() => filterMediaByType("video")}
            >
              Video
            </button>
            <button
              className={`filter-button ${
                selectedMediaType === "audio" ? "active" : ""
              }`}
              onClick={() => filterMediaByType("audio")}
            >
              Âm thanh
            </button>
            <button
              className={`filter-button ${
                selectedMediaType === "file" ? "active" : ""
              }`}
              onClick={() => filterMediaByType("file")}
            >
              Tập tin
            </button>
          </div>
          <div className="media-items">
            {mediaFiles
              .filter(
                (file) =>
                  selectedMediaType === "all" || file.type === selectedMediaType
              )
              .map((file) => (
                <div key={file._id} className="media-item">
                  {file.type === "image" && (
                    <img src={file.fileUrl} alt={file.fileName} />
                  )}
                  {file.type === "video" && (
                    <video controls>
                      <source src={file.fileUrl} type="video/mp4" />
                    </video>
                  )}
                  {file.type === "audio" && (
                    <audio controls>
                      <source src={file.fileUrl} type="audio/mpeg" />
                    </audio>
                  )}
                  {file.type === "file" && (
                    <div className="file-item">
                      <FiFileText />
                      <span>{file.fileName}</span>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="delete-dialog">
          <div className="dialog-header">
            <h3>Xóa tin nhắn</h3>
            <button
              className="close-button"
              onClick={() => setShowDeleteDialog(false)}
            >
              <FiX />
            </button>
          </div>
          <p>Bạn có chắc chắn muốn xóa toàn bộ tin nhắn?</p>
          <label>
            <input
              type="checkbox"
              checked={deleteAllMessages}
              onChange={(e) => setDeleteAllMessages(e.target.checked)}
            />
            Xóa tin nhắn cho cả hai bên
          </label>
          <button className="delete-button" onClick={handleDeleteConversation}>
            Xóa
          </button>
        </div>
      )}

      {/* Chat Messages */}
      <div className="chat-messages">
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
        {!error && messages.length === 0 ? (
          <div className="no-messages">
            <p>Hãy bắt đầu cuộc trò chuyện với {friend.name}</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message._id}
              data-message-id={message._id}
              className={`message ${
                isMessageFromCurrentUser(message, user?._id)
                  ? "sent"
                  : "received"
              } ${message.unsent ? "unsent" : ""}`}
              onContextMenu={(e) => {
                e.preventDefault();
                handleLongPress(message);
              }}
            >
              {/* Hiển thị tin nhắn đang trả lời nếu có */}
              {message.replyTo && (
                <div className="reply-content">
                  <div className="reply-indicator"></div>
                  <div className="reply-text">
                    <span className="reply-sender">
                      {message.replyTo.sender === user?._id
                        ? "Bạn"
                        : friend.name}
                    </span>
                    <p>{message.replyTo.content}</p>
                  </div>
                </div>
              )}

              <div className="message-content">
                {!message.unsent ? (
                  renderMessageContent(
                    message,
                    openMediaPreview,
                    handleDownloadFile
                  )
                ) : (
                  <span className="unsent-message">Tin nhắn đã bị thu hồi</span>
                )}

                {/* Nút hiển thị khi hover */}
                {!message.unsent && (
                  <div className="message-hover-actions">
                    <button
                      className="hover-action-button reply-button"
                      onClick={() => handleReply(message)}
                      title="Trả lời"
                    >
                      <span role="img" aria-label="Reply">
                        ↩️
                      </span>
                    </button>

                    {/* Facebook-style quick reactions bar */}
                    <div className="quick-reactions">
                      {commonEmojis.slice(0, 6).map((item) => (
                        <button
                          key={item.emoji}
                          className="hover-action-button quick-reaction-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReaction(item.emoji);
                            setSelectedMessage(message);
                          }}
                          title={item.label}
                        >
                          {item.emoji}
                        </button>
                      ))}
                      <button
                        className="hover-action-button reaction-button more-reactions"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEmojiPicker(message);
                        }}
                        title="Thêm cảm xúc"
                      >
                        <span role="img" aria-label="More reactions">
                          +
                        </span>
                      </button>
                    </div>

                    {/* Thêm nút tải xuống cho file, ảnh, video */}
                    {["image", "video", "audio", "file"].includes(
                      message.type || ""
                    ) && (
                      <button
                        className="hover-action-button download-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadFile(message);
                        }}
                        title="Tải xuống"
                      >
                        <span role="img" aria-label="Download">
                          💾
                        </span>
                      </button>
                    )}

                    {/* Nút xóa tin nhắn (với tất cả) */}
                    <button
                      className="hover-action-button delete-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteForMe(message);
                      }}
                      title="Xóa tin nhắn"
                    >
                      <span role="img" aria-label="Delete">
                        🗑️
                      </span>
                    </button>

                    {/* Nút thu hồi tin nhắn */}
                    {isMessageFromCurrentUser(message, user?._id) && (
                      <button
                        className="hover-action-button unsend-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnsendMessage(message);
                        }}
                        title="Thu hồi tin nhắn"
                      >
                        <span role="img" aria-label="Unsend">
                          ↩️
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Hiển thị reactions */}
              {renderReactions(message)}

              <div className="message-info">
                <span className="message-time">
                  {formatTime(message.createdAt)}
                </span>
                {isMessageFromCurrentUser(message, user?._id) &&
                  renderMessageStatus(
                    message.status as "sent" | "delivered" | "seen"
                  )}
              </div>

              {/* Menu tương tác khi chọn tin nhắn */}
              {selectedMessage?._id === message._id &&
                !showEmojiPicker &&
                !message.unsent && (
                  <div className="message-actions">
                    <button
                      className="action-button"
                      onClick={() => setShowEmojiPicker(true)}
                    >
                      😀 Thả cảm xúc
                    </button>
                    <button
                      className="action-button"
                      onClick={() => handleReply(message)}
                    >
                      ↩️ Trả lời
                    </button>
                    {["image", "video", "audio", "file"].includes(
                      message.type || ""
                    ) && (
                      <button
                        className="action-button"
                        onClick={() => handleDownloadFile(message)}
                      >
                        💾 Tải xuống
                      </button>
                    )}
                    {/* Nút xóa tin nhắn chỉ hiển thị với mình */}
                    <button
                      className="action-button"
                      onClick={() => handleDeleteForMe(message)}
                    >
                      🗑️ Xóa với mình
                    </button>
                    {isMessageFromCurrentUser(message, user?._id) && (
                      <button
                        className="action-button"
                        onClick={() => unsendMessage(message, true)}
                      >
                        ↩️ Thu hồi với mọi người
                      </button>
                    )}
                    <button
                      className="action-button close"
                      onClick={() => setSelectedMessage(null)}
                    >
                      ✖️ Đóng
                    </button>
                  </div>
                )}

              {/* Bảng chọn emoji */}
              {selectedMessage?._id === message._id &&
                showEmojiPicker &&
                !message.unsent && (
                  <div className="emoji-picker">
                    {commonEmojis.map((item) => (
                      <button
                        key={item.emoji}
                        className="emoji-button"
                        onClick={() => handleReaction(item.emoji)}
                        title={item.label}
                        data-testid={`emoji-${item.label}`}
                      >
                        {item.emoji}
                        <span className="emoji-tooltip">{item.label}</span>
                      </button>
                    ))}
                    <button
                      className="emoji-button close"
                      onClick={() => {
                        setShowEmojiPicker(false);
                        setSelectedMessage(null);
                      }}
                    >
                      ✖️
                    </button>
                  </div>
                )}
            </div>
          ))
        )}
        {isTyping && (
          <div className="typing-indicator">
            <span>{friend.name} đang nhập...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* File upload progress indicator */}
      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <span>{uploadProgress}%</span>
        </div>
      )}

      {/* Media preview */}
      <MediaPreview
        mediaPreview={mediaPreview}
        closeMediaPreview={closeMediaPreview}
      />

      {/* Hiển thị thanh trả lời nếu đang trả lời */}
      <ReplyBar
        replyToMessage={replyToMessage}
        friend={friend}
        user={user}
        cancelReply={cancelReply}
      />

      <div className="chat-input-container group-style">
        <form onSubmit={handleSendMessage} className="message-form group-style">
          <AttachmentMenu handleFileUpload={handleFileUploadWrapper} />
          <input
            type="text"
            placeholder={
              isUploading ? "Uploading attachment..." : "Type a message..."
            }
            value={newMessage}
            onChange={handleTyping}
            disabled={isUploading}
            className="chat-input group-style"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || isUploading}
            className="send-button group-style"
          >
            <MdSend />
          </button>
        </form>
      </div>

      {/* Container for confirm dialogs */}
      <div id="confirm-dialog-root"></div>
    </div>
  );
};

// Sửa lại AttachmentMenu để truyền handleFileUpload cho tất cả input file
const AttachmentMenu = ({ handleFileUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const toggleMenu = () => setIsOpen(!isOpen);
  return (
    <div className="attach-menu-container">
      <button type="button" className="attach-button" onClick={toggleMenu}>
        <FiPaperclip />
      </button>
      {isOpen && (
        <div className="attach-menu">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="attach-option image"
          >
            <FiImage />
            <span>Image</span>
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="attach-option video"
          >
            <FiVideo />
            <span>Video</span>
          </button>
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="attach-option audio"
          >
            <FiMusic />
            <span>Audio</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="attach-option document"
          >
            <FiFileText />
            <span>Document</span>
          </button>
        </div>
      )}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
      <input
        type="file"
        ref={videoInputRef}
        accept="video/*"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
      <input
        type="file"
        ref={audioInputRef}
        accept="audio/*"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
    </div>
  );
};

export default ChatInterface;
