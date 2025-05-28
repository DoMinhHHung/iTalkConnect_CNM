import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { useParams } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "../redux/hooks";
import "../scss/GroupChatInterface.scss";
import {
  incrementUnreadGroupMessages,
  resetUnreadGroupMessages,
} from "../redux/slices/messageSlice";

import {
  FiVideo,
  FiFileText,
  FiX,
  FiPaperclip,
  FiImage,
  FiMusic,
  FiSend,
  FiMoreVertical,
  FiSearch,
  FiTrash2,
  FiArchive,
  FiUserPlus,
  FiUserX,
  FiUserCheck,
  FiUsers,
  FiSettings,
  FiUpload,
} from "./IconComponents";

import {
  Message,
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
  GroupMessage,
  Role,
  GroupMember,
  Group,
  MessageSender,
} from "./GroupChatTypes";

import CoAdminDialog from "./CoAdminDialog";
import {
  API_URL,
  API_ENDPOINT,
  SOCKET_URL,
  SOCKET_OPTIONS,
} from "../constants";

// Thêm component AlertDialog để hiển thị thông báo
const AlertDialog: React.FC<{
  isOpen: boolean;
  message: string;
  onClose: () => void;
}> = ({ isOpen, message, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="alert-dialog-overlay">
      <div className="alert-dialog">
        <div className="alert-dialog-content">
          <p>{message}</p>
          <div className="alert-dialog-actions">
            <button className="alert-button" onClick={onClose}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Hàm hiển thị thông báo tùy chỉnh thay thế cho alert
const showAlertDialog = (message: string): Promise<void> => {
  return new Promise((resolve) => {
    // Tạo div để render dialog
    const dialogRoot = document.createElement("div");
    dialogRoot.id = "alert-dialog-root";
    document.body.appendChild(dialogRoot);

    // Hàm dọn dẹp dialog sau khi đóng
    const cleanupDialog = () => {
      ReactDOM.unmountComponentAtNode(dialogRoot);
      document.body.removeChild(dialogRoot);
    };

    // Render component dialog
    ReactDOM.render(
      <AlertDialog
        message={message}
        isOpen={true}
        onClose={() => {
          resolve();
          cleanupDialog();
        }}
      />,
      dialogRoot
    );
  });
};

interface GroupChatInterfaceProps {
  overrideGroupId?: string;
}

const GroupChatInterface: React.FC<GroupChatInterfaceProps> = ({
  overrideGroupId,
}) => {
  const params = useParams<{ groupId: string }>();
  // Use the override if provided, otherwise use the URL parameter
  const groupId = overrideGroupId || params.groupId;
  const { user } = useAppSelector((state) => state.auth);
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const [apiStatus, setApiStatus] = useState<{
    groupInfo: boolean;
    messages: boolean;
  }>({ groupInfo: false, messages: false });
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(
    new Map()
  );
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null
  );
  const [selectedMessage, setSelectedMessage] = useState<GroupMessage | null>(
    null
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<GroupMessage | null>(
    null
  );
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaPreview, setMediaPreview] = useState<GroupMessage | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);

  // UI state variables
  const [showGroupOptions, setShowGroupOptions] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [showRemoveMemberDialog, setShowRemoveMemberDialog] = useState(false);
  const [showManageCoAdminDialog, setShowManageCoAdminDialog] = useState(false);
  const [newMemberSearch, setNewMemberSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMessageResults, setSearchMessageResults] = useState<
    GroupMessage[]
  >([]);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [selectedMediaType, setSelectedMediaType] = useState<
    "all" | "image" | "video" | "audio" | "file"
  >("all");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLeaveGroupDialog, setShowLeaveGroupDialog] = useState(false);
  const [showDeleteOptionsDialog, setShowDeleteOptionsDialog] = useState(false);
  const [selectedMessageForDelete, setSelectedMessageForDelete] =
    useState<GroupMessage | null>(null);

  // Các biến state cho chức năng chỉnh sửa thông tin nhóm
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [showEditNameDialog, setShowEditNameDialog] = useState(false);
  const [showEditAvatarDialog, setShowEditAvatarDialog] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [selectedCoAdminAction, setSelectedCoAdminAction] = useState<
    "add" | "remove"
  >("add");
  const [coAdminSearchResults, setCoAdminSearchResults] = useState<any[]>([]);
  const [coAdminSearchTerm, setCoAdminSearchTerm] = useState("");

  // Thêm state cho dialog chuyển quyền admin
  const [showTransferAdminDialog, setShowTransferAdminDialog] = useState(false);
  const [transferToUserId, setTransferToUserId] = useState<string | null>(null);

  const dispatch = useAppDispatch();

  // Track processed messages to avoid duplicates
  const [processedMessageIds, setProcessedMessageIds] = useState<Set<string>>(
    new Set()
  );

  // Function to check and register a message ID to avoid duplicates
  const registerMessageId = useCallback(
    (messageId: string, content: string, sender: any): boolean => {
      // Create a unique signature combining multiple properties to better detect duplicates
      const messageSignature = `${messageId}:${content}:${
        typeof sender === "object" ? sender._id : sender
      }`;

      // Also check if this is in our current messages list
      const isDuplicate = messages.some(
        (msg) =>
          msg._id === messageId || (msg.tempId && msg.tempId === messageId)
      );

      if (
        processedMessageIds.has(messageSignature) ||
        processedMessageIds.has(messageId) ||
        isDuplicate
      ) {
        console.log(`Message already processed, skipping: ${messageId}`);
        return false;
      }

      setProcessedMessageIds((prev) => {
        const updated = new Set(prev);
        updated.add(messageSignature);
        updated.add(messageId);
        // Keep set size manageable to avoid memory issues
        if (updated.size > 200) {
          const iterator = updated.values();
          updated.delete(iterator.next().value);
        }
        return updated;
      });

      return true;
    },
    [processedMessageIds, messages]
  );

  // Enhanced function to check if a message already exists in the UI
  const isMessageDuplicate = useCallback(
    (newMessage: any): boolean => {
      // Generate a unique identifier for this message
      const messageId = newMessage._id;
      const tempId = newMessage.tempId || newMessage._tempId;
      const content = newMessage.content;
      const sender =
        typeof newMessage.sender === "object"
          ? newMessage.sender._id
          : newMessage.sender;
      const timestamp = new Date(newMessage.createdAt).getTime();

      // Check if this message is already in our messages list
      return messages.some(
        (msg) =>
          // Check by ID
          msg._id === messageId ||
          // Check by tempId
          (tempId &&
            (msg._id === tempId || (msg.tempId && msg.tempId === tempId))) ||
          // Check by content, sender and approximate timestamp (within 5 seconds)
          (msg.content === content &&
            ((typeof msg.sender === "object" && msg.sender._id === sender) ||
              (typeof msg.sender === "string" && msg.sender === sender)) &&
            Math.abs(new Date(msg.createdAt).getTime() - timestamp) < 5000)
      );
    },
    [messages]
  );

  // Add toast functionality
  const showToast = (
    message: string,
    type: "success" | "error" = "success"
  ) => {
    setError(type === "error" ? message : "");
    setSuccess(type === "success" ? message : "");

    // Clear after a few seconds
    setTimeout(() => {
      setError("");
      setSuccess("");
    }, 3000);
  };

  useEffect(() => {
    dispatch(resetUnreadGroupMessages());
  }, [dispatch]);

  const fetchGroupInfo = async () => {
    try {
      if (!groupId || groupId === "undefined" || !user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      // Reset error
      setError("");

      const token = localStorage.getItem("token");

      // Get group details
      const groupResponse = await axios.get(
        `${API_ENDPOINT}/groups/${groupId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (groupResponse.data) {
        setGroup(groupResponse.data);
        setApiStatus((prev) => ({ ...prev, groupInfo: true }));

        const isMember = groupResponse.data.members.some(
          (member: any) => member._id === user._id
        );

        if (!isMember) {
          setError("Bạn không phải là thành viên của nhóm này");
          setLoading(false);
          return;
        }
      }

      // Get messages
      const messagesResponse = await axios.get(
        `${API_ENDPOINT}/groups/${groupId}/messages`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (messagesResponse.data) {
        setMessages(messagesResponse.data);
        setApiStatus((prev) => ({ ...prev, messages: true }));
      }

      // Get user role in group
      try {
        const roleResponse = await axios.get(
          `${API_ENDPOINT}/groups/${groupId}/role`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (
          roleResponse.data &&
          roleResponse.data.success &&
          roleResponse.data.role
        ) {
          setUserRole(roleResponse.data.role);
          console.log("User role set from API:", roleResponse.data.role);
        } else {
          throw new Error("Role data invalid or missing success indicator");
        }
      } catch (roleError) {
        console.error("Error fetching user role:", roleError);
        // Fallback: Determine role locally if API fails
        if (groupResponse.data) {
          // Check if user is admin
          if (groupResponse.data.admin._id === user._id) {
            setUserRole("admin");
          }
          // Check if user is co-admin
          else if (
            groupResponse.data.coAdmins &&
            groupResponse.data.coAdmins.some(
              (admin: any) => admin._id === user._id
            )
          ) {
            setUserRole("coAdmin");
          }
          // Otherwise, user is a regular member
          else {
            setUserRole("member");
          }
          console.log("Using fallback role determination:", userRole);
        }
      }

      setLoading(false);
    } catch (err: any) {
      console.error("Error fetching group data:", err);
      setError(
        err.response?.data?.message ||
          "Lỗi khi tải dữ liệu nhóm. Vui lòng thử lại sau."
      );
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupInfo();
  }, [groupId, user]);

  // Khởi tạo socket
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !user) return;

    console.log("Khởi tạo socket cho chat nhóm");

    // Khởi tạo socket với địa chỉ server và cấu hình tự kết nối lại
    const newSocket = io(SOCKET_URL, {
      auth: {
        token,
      },
      ...SOCKET_OPTIONS,
    });

    console.log("Socket initializing with options:", SOCKET_OPTIONS);
    console.log("Socket connecting to URL:", SOCKET_URL);

    setSocket(newSocket);

    // Xử lý kết nối và lỗi socket
    newSocket.on("connect", () => {
      console.log("Socket đã kết nối thành công với ID:", newSocket.id);

      // Tham gia phòng người dùng
      newSocket.emit("joinUserRoom", { userId: user._id });
      console.log("Đã tham gia phòng người dùng:", user._id);

      if (groupId) {
        // Format room ID properly to match mobile format
        const roomId = `group:${groupId}`;

        // Join with exact format for room ID
        newSocket.emit("joinRoom", { roomId: roomId });
        console.log("Đã tham gia phòng nhóm với joinRoom:", roomId);

        // Join with explicit group room - mirroring mobile format exactly
        newSocket.emit("joinGroupRoom", { groupId: groupId });
        console.log("Đã tham gia phòng nhóm với joinGroupRoom:", groupId);

        // Request missed messages with consistent format
        newSocket.emit("requestMissedMessages", {
          roomId: roomId,
          isGroup: true,
        });
        console.log("Đã yêu cầu tin nhắn nhỡ cho nhóm:", roomId);
      }
    });

    newSocket.on("connect_error", (error) => {
      console.error("Lỗi kết nối socket:", error.message);
      // Try to reconnect after a delay
      setTimeout(() => {
        if (!newSocket.connected) {
          console.log("Đang thử kết nối lại socket...");
          newSocket.connect();
        }
      }, 3000);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket bị ngắt kết nối:", reason);
      // If the disconnection is not from a deliberate disconnect call
      if (reason === "io server disconnect") {
        // the disconnection was initiated by the server, reconnect manually
        setTimeout(() => {
          console.log("Đang thử kết nối lại sau khi server ngắt kết nối...");
          newSocket.connect();
        }, 1000);
      }
      // else the socket will automatically try to reconnect
    });

    newSocket.on("groupMessage", (data: any) => {
      console.log("Nhận tin nhắn nhóm mới:", data);

      if (data.groupId !== groupId) {
        console.log("Tin nhắn không thuộc về nhóm hiện tại, bỏ qua");
        return;
      }

      // Extract IDs for reference
      const messageId = data._id;
      const tempId = data._tempId || data.tempId;

      // First, check if this is updating one of our temp messages
      const isUpdatingTempMessage =
        tempId &&
        messages.some((msg) => msg.tempId === tempId || msg._id === tempId);

      if (isUpdatingTempMessage) {
        console.log(
          `Cập nhật tin nhắn tạm thời với ID ${tempId} thành ID thực ${messageId}`
        );

        setMessages((prev) =>
          prev.map((msg) => {
            // If this message matches our temp ID, update it with server data
            if (msg.tempId === tempId || msg._id === tempId) {
              return {
                ...msg,
                _id: messageId,
                _isSending: false,
                ...data,
              };
            }
            return msg;
          })
        );

        return; // Stop processing if we just updated a temp message
      }

      // Next, check if this is a truly new message or a duplicate
      const isDuplicate = messages.some(
        (msg) =>
          msg._id === messageId ||
          (msg.content === data.content &&
            ((typeof msg.sender === "object" &&
              typeof data.sender === "object" &&
              msg.sender._id === data.sender._id) ||
              (typeof msg.sender === "string" &&
                typeof data.sender === "string" &&
                msg.sender === data.sender)) &&
            Math.abs(
              new Date(msg.createdAt).getTime() -
                new Date(data.createdAt).getTime()
            ) < 5000)
      );

      if (isDuplicate) {
        console.log(`Tin nhắn ${messageId} đã tồn tại trong danh sách, bỏ qua`);
        return;
      }

      // At this point, we have a genuinely new message - register and add it
      console.log(`Thêm tin nhắn nhóm mới: ${messageId}`);

      const newMessage: GroupMessage = {
        _id: data._id,
        sender: data.sender,
        groupId: data.groupId,
        content: data.content,
        createdAt: data.createdAt,
        chatType: "group",
        receiver: "",
        ...(data.replyTo
          ? {
              replyTo: {
                _id: data.replyTo._id,
                content: data.replyTo.content,
                sender: data.replyTo.sender,
              },
            }
          : {}),
        ...(data.type ? { type: data.type } : {}),
        ...(data.fileUrl ? { fileUrl: data.fileUrl } : {}),
        ...(data.fileName ? { fileName: data.fileName } : {}),
        ...(data.fileSize ? { fileSize: data.fileSize } : {}),
        ...(data.fileThumbnail ? { fileThumbnail: data.fileThumbnail } : {}),
        ...(data.fileId ? { fileId: data.fileId } : {}),
        ...(data.expiryDate ? { expiryDate: data.expiryDate } : {}),
        ...(data.tempId || data._tempId
          ? { tempId: data.tempId || data._tempId }
          : {}),
      };

      setMessages((prev) => [...prev, newMessage]);
    });

    // Also handle receiveGroupMessage the same way
    newSocket.on("receiveGroupMessage", (data: any) => {
      if (data.groupId !== groupId) {
        return;
      }

      // Extract IDs for reference
      const messageId = data._id;
      const tempId = data._tempId || data.tempId;

      // First, check if this is updating one of our temp messages
      const isUpdatingTempMessage =
        tempId &&
        messages.some((msg) => msg.tempId === tempId || msg._id === tempId);

      if (isUpdatingTempMessage) {
        console.log(
          `Cập nhật tin nhắn tạm thời với ID ${tempId} thành ID thực ${messageId} (receiveGroupMessage)`
        );

        setMessages((prev) =>
          prev.map((msg) => {
            // If this message matches our temp ID, update it with server data
            if (msg.tempId === tempId || msg._id === tempId) {
              return {
                ...msg,
                _id: messageId,
                _isSending: false,
                ...data,
              };
            }
            return msg;
          })
        );

        return; // Stop processing if we just updated a temp message
      }

      // Next, check if this is a truly new message or a duplicate
      const isDuplicate = messages.some(
        (msg) =>
          msg._id === messageId ||
          (msg.content === data.content &&
            ((typeof msg.sender === "object" &&
              typeof data.sender === "object" &&
              msg.sender._id === data.sender._id) ||
              (typeof msg.sender === "string" &&
                typeof data.sender === "string" &&
                msg.sender === data.sender)) &&
            Math.abs(
              new Date(msg.createdAt).getTime() -
                new Date(data.createdAt).getTime()
            ) < 5000)
      );

      if (isDuplicate) {
        console.log(
          `Tin nhắn ${messageId} đã tồn tại trong danh sách, bỏ qua (receiveGroupMessage)`
        );
        return;
      }

      // At this point, we have a genuinely new message - register and add it
      console.log(
        `Thêm tin nhắn nhóm mới từ receiveGroupMessage: ${messageId}`
      );

      const newMessage: GroupMessage = {
        _id: data._id,
        sender: data.sender,
        groupId: data.groupId,
        content: data.content,
        createdAt: data.createdAt,
        chatType: "group",
        receiver: "",
        ...(data.replyTo ? { replyTo: data.replyTo } : {}),
        ...(data.type ? { type: data.type } : {}),
        ...(data.fileUrl ? { fileUrl: data.fileUrl } : {}),
        ...(data.fileName ? { fileName: data.fileName } : {}),
        ...(data.fileSize ? { fileSize: data.fileSize } : {}),
        ...(data.fileThumbnail ? { fileThumbnail: data.fileThumbnail } : {}),
        ...(data.fileId ? { fileId: data.fileId } : {}),
        ...(data.expiryDate ? { expiryDate: data.expiryDate } : {}),
        ...(data._tempId ? { tempId: data._tempId } : {}),
      };

      setMessages((prev) => [...prev, newMessage]);
    });

    newSocket.on(
      "userTypingInGroup",
      (data: { userId: string; groupId: string; userName: string }) => {
        if (data.groupId === groupId && data.userId !== user._id) {
          setTypingUsers((prev) => {
            const newMap = new Map(prev);
            newMap.set(data.userId, data.userName);
            return newMap;
          });
        }
      }
    );

    newSocket.on(
      "userStoppedTypingInGroup",
      (data: { userId: string; groupId: string }) => {
        if (data.groupId === groupId) {
          setTypingUsers((prev) => {
            const newMap = new Map(prev);
            newMap.delete(data.userId);
            return newMap;
          });
        }
      }
    );

    newSocket.on(
      "groupMessageReaction",
      (data: {
        messageId: string;
        userId: string;
        emoji: string;
        groupId: string;
      }) => {
        if (data.groupId === groupId) {
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg._id === data.messageId
                ? {
                    ...msg,
                    reactions: {
                      ...(msg.reactions || {}),
                      [data.userId]: data.emoji,
                    },
                  }
                : msg
            )
          );
        }
      }
    );

    newSocket.on(
      "groupMessageDeleted",
      (data: { messageId: string; deletedBy: string; groupId: string }) => {
        if (data.groupId === groupId) {
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg._id === data.messageId
                ? {
                    ...msg,
                    content: "This message has been deleted",
                    isUnsent: true,
                  }
                : msg
            )
          );
        }
      }
    );

    newSocket.on(
      "newGroupMember",
      (data: { groupId: string; memberId: string; addedBy: string }) => {
        if (data.groupId === groupId) {
          fetchGroupInfo();
        }
      }
    );

    newSocket.on(
      "memberLeftGroup",
      (data: { groupId: string; memberId: string; removedBy: string }) => {
        if (data.groupId === groupId) {
          fetchGroupInfo();

          if (data.memberId === user._id) {
            setError("You have been removed from this group");
          }
        }
      }
    );

    newSocket.on(
      "groupDissolved",
      (data: { groupId: string; dissolvedBy: string }) => {
        if (data.groupId === groupId) {
          setError("This group has been dissolved by the admin");
        }
      }
    );

    newSocket.on(
      "newCoAdmin",
      (data: { groupId: string; userId: string; addedBy: string }) => {
        if (data.groupId === groupId) {
          fetchGroupInfo();

          if (data.userId === user._id) {
            setUserRole("coAdmin");
          }
        }
      }
    );

    newSocket.on(
      "coAdminRemoved",
      (data: { groupId: string; userId: string; removedBy: string }) => {
        if (data.groupId === groupId) {
          fetchGroupInfo();

          if (data.userId === user._id) {
            setUserRole("member");
          }
        }
      }
    );

    // Xử lý các sự kiện trạng thái người dùng
    newSocket.on("onlineUsers", (userIds: string[]) => {
      console.log("Danh sách người dùng online:", userIds);
      setOnlineUsers(new Set(userIds));
    });

    newSocket.on("userOnline", (userId: string) => {
      console.log("Người dùng online:", userId);
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.add(userId);
        return newSet;
      });
    });

    newSocket.on("userOffline", (userId: string) => {
      console.log("Người dùng offline:", userId);
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });

      setTypingUsers((prev) => {
        const newMap = new Map(prev);
        newMap.delete(userId);
        return newMap;
      });
    });

    // Thêm cơ chế polling định kỳ làm dự phòng
    const fetchMessagesInterval = setInterval(async () => {
      if (!groupId || !user) return;

      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        // Lấy tin nhắn mới nhất từ server
        const response = await axios.get(
          `${API_ENDPOINT}/groups/${groupId}/messages`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.data && response.data.length > 0) {
          // So sánh với tin nhắn hiện có để chỉ thêm tin nhắn mới
          setMessages((currentMessages) => {
            const existingIds = new Set(currentMessages.map((msg) => msg._id));
            const newMessages = response.data.filter(
              (msg: GroupMessage) => !existingIds.has(msg._id)
            );

            if (newMessages.length > 0) {
              console.log(
                `Tìm thấy ${newMessages.length} tin nhắn nhóm mới qua polling`
              );
              return [...currentMessages, ...newMessages];
            }

            return currentMessages;
          });
        }
      } catch (error) {
        console.error("Lỗi khi poll tin nhắn nhóm:", error);
      }
    }, 10000); // Poll mỗi 10 giây

    // Add handler for general messages to support mobile
    newSocket.on("message", (data: any) => {
      // Only handle group messages
      if (
        !data.chatType ||
        data.chatType !== "group" ||
        !data.groupId ||
        data.groupId !== groupId
      ) {
        return;
      }

      console.log("Received general message event:", data);

      // Process the message similar to groupMessage
      const messageUniqueId =
        data._id ||
        data.tempId ||
        `${data.sender}-${data.createdAt}-${data.content.substring(0, 10)}`;

      // Check if we've already processed this message
      if (!registerMessageId(messageUniqueId, data.content, data.sender)) {
        return;
      }

      // Check if this is updating an existing message
      const existingMessageIndex = messages.findIndex(
        (msg) =>
          msg._id === data.tempId ||
          (msg.tempId && msg.tempId === data.tempId) ||
          msg._id === data._id
      );

      if (existingMessageIndex >= 0) {
        // Update existing message
        console.log(
          "Updating existing message:",
          messages[existingMessageIndex]._id,
          "->",
          data._id
        );
        setMessages((prev) => {
          const updated = [...prev];
          updated[existingMessageIndex] = {
            ...updated[existingMessageIndex],
            _id: data._id || updated[existingMessageIndex]._id,
            ...(data.status ? { status: data.status } : {}),
          };
          return updated;
        });
      } else {
        // Add as new message
        const newMessage: GroupMessage = {
          _id: data._id,
          sender: data.sender,
          groupId: data.groupId,
          content: data.content,
          createdAt: data.createdAt || new Date().toISOString(),
          chatType: "group",
          receiver: "",
          ...(data.type ? { type: data.type } : {}),
          ...(data.tempId ? { tempId: data.tempId } : {}),
          // Include other fields as needed
        };

        console.log("Adding new message from 'message' event:", newMessage._id);
        setMessages((prev) => [...prev, newMessage]);
      }
    });

    return () => {
      console.log("Dọn dẹp kết nối socket chat nhóm");
      if (newSocket) {
        // Rời khỏi các phòng
        if (groupId) {
          newSocket.emit("leaveGroupRoom", { groupId });
          console.log("Đã rời phòng nhóm:", groupId);
        }
        newSocket.disconnect();
      }
      clearInterval(fetchMessagesInterval);
    };
  }, [groupId, user, dispatch, registerMessageId]);

  // Modified useEffect for proper scrolling behavior
  useEffect(() => {
    if (shouldScrollToBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, shouldScrollToBottom]);

  // Add a new useEffect to handle initial scroll after loading completes
  useEffect(() => {
    if (!loading && messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [loading, messages.length]);

  // Add an event handler to detect user scrolling
  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        messagesContainerRef.current;
      // If user has scrolled up more than 100px, don't auto-scroll on new messages
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldScrollToBottom(isNearBottom);
    }
  }, []);

  // Add scroll event listener when component mounts
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => {
        container.removeEventListener("scroll", handleScroll);
      };
    }
  }, [handleScroll]);

  // Add a useEffect to filter out locally deleted messages on load
  useEffect(() => {
    // Function to filter out locally deleted messages
    const filterLocallyDeletedMessages = () => {
      try {
        if (!user || !groupId) return;

        const storageKey = `deleted_messages_${user._id}`;
        const deletedDataStr = localStorage.getItem(storageKey);

        if (deletedDataStr) {
          const deletedMessages = JSON.parse(deletedDataStr);

          // Get list of deleted message IDs for this group
          const deletedIds = deletedMessages[groupId] || [];

          if (deletedIds.length > 0) {
            // Filter out any deleted messages
            setMessages((prevMessages) =>
              prevMessages.filter((msg) => !deletedIds.includes(msg._id))
            );
            console.log(
              `Filtered out ${deletedIds.length} locally deleted messages`
            );
          }
        }
      } catch (error) {
        console.error("Error filtering locally deleted messages:", error);
      }
    };

    // Apply filter when messages are loaded
    if (!loading && messages.length > 0) {
      filterLocallyDeletedMessages();
    }
  }, [loading, messages.length, groupId, user]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (socket && user && groupId) {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }

      socket.emit("typingInGroup", {
        senderId: user._id,
        groupId: groupId,
        senderName: user.name,
      });

      const timeout = setTimeout(() => {
        if (socket) {
          socket.emit("stopTypingInGroup", {
            senderId: user._id,
            groupId: groupId,
          });
        }
      }, 2000);

      setTypingTimeout(timeout);
    }
  };

  // Helper function to send message via API fallback
  const sendMessageViaAPI = async (messageData: any, tempId: string) => {
    try {
      const token = localStorage.getItem("token");
      console.log("Sending message via API with tempId:", tempId);

      const response = await axios.post(
        `${API_ENDPOINT}/groups/message`,
        messageData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data && response.data._id) {
        console.log("Message saved via API:", response.data._id);

        // Update the temporary message with the real ID and mark as sent
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg._id === tempId || (msg.tempId && msg.tempId === tempId)
              ? {
                  ...msg,
                  _id: response.data._id,
                  _isSending: false,
                  status: "sent",
                  ...response.data, // Copy all server-provided data to ensure latest version
                }
              : msg
          )
        );

        // Register the real ID to prevent duplicates if the socket also delivers this message
        const senderObj =
          typeof response.data.sender === "object"
            ? response.data.sender._id
            : response.data.sender;

        registerMessageId(response.data._id, response.data.content, senderObj);
      }
    } catch (apiError) {
      console.error("Error saving message via API:", apiError);

      // Mark the temporary message as failed
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg._id === tempId || (msg.tempId && msg.tempId === tempId)
            ? { ...msg, _isSending: false, status: "failed" }
            : msg
        )
      );
    }
  };

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !groupId) return;

    // Dừng trạng thái đang nhập
    if (socket) {
      socket.emit("stopTypingInGroup", {
        senderId: user._id,
        groupId: groupId,
      });
    }

    // Tạo ID tạm thời cho tin nhắn
    const tempId = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Tạo tin nhắn tạm thời để hiển thị ngay lập tức
    const tempMessage: GroupMessage = {
      _id: tempId,
      sender: {
        _id: user._id,
        name: user.name,
        avt: user.avt,
      },
      receiver: "", // Add required receiver property
      groupId: groupId,
      content: newMessage,
      createdAt: timestamp,
      chatType: "group",
      tempId: tempId, // Store tempId for deduplication
      _isSending: true, // Add a flag to indicate this is a temp message still being sent
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

    // Register this temp message in our deduplication system
    registerMessageId(tempId, newMessage, user._id);

    // Thêm tin nhắn tạm vào danh sách hiển thị ngay lập tức
    setMessages((prev) => [...prev, tempMessage]);

    // Tạo dữ liệu gửi đi
    const messageData = {
      sender: user._id,
      senderId: user._id,
      roomId: `group:${groupId}`,
      groupId: groupId,
      content: newMessage,
      tempId, // Include tempId for deduplication
      timestamp: timestamp, // Include creation timestamp
      type: "text",
      chatType: "group",
      ...(replyToMessage ? { replyToId: replyToMessage._id } : {}),
    };

    // Track if we've successfully sent the message
    let messageSent = false;

    // Chỉ gửi qua socket event 'message' (server chỉ xử lý event này cho web)
    if (socket && socket.connected) {
      try {
        console.log(
          "Socket connected, sending message via 'message' event only"
        );
        socket.emit("message", {
          ...messageData,
          room: `group:${groupId}`,
          roomId: `group:${groupId}`,
          chatType: "group",
        });
        messageSent = true;
      } catch (socketError) {
        console.error("Error sending via socket:", socketError);
      }
    } else {
      console.log("Socket not connected, using API fallback");
    }

    // Only use API as fallback if socket failed, not both
    if (!messageSent) {
      console.log("Using API fallback to send message");
      await sendMessageViaAPI(messageData, tempId);
    }

    // Reset form
    setNewMessage("");
    setReplyToMessage(null);
    setIsReplying(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket || !user || !groupId) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);

      let fileType: "image" | "video" | "audio" | "file" = "file";
      if (file.type.startsWith("image/")) fileType = "image";
      else if (file.type.startsWith("video/")) fileType = "video";
      else if (file.type.startsWith("audio/")) fileType = "audio";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", fileType);
      formData.append("groupId", groupId);
      formData.append("senderId", user._id);
      const token = localStorage.getItem("token");
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
        console.log("File uploaded:", fileData);
      } catch (error) {
        console.error("Error uploading file:", error);
        setError(`Failed to upload file: ${file.name}`);
        setIsUploading(false);
        return;
      }

      const tempId = `temp_${Date.now()}`;

      // Register this message ID to prevent duplicates
      registerMessageId(tempId, file.name, user._id);

      // Add message to local state
      const newMessage: GroupMessage = {
        _id: tempId,
        content: file.name,
        sender: user,
        groupId: groupId,
        createdAt: new Date().toISOString(),
        type: fileType,
        fileUrl: fileData.fileUrl,
        fileName: file.name,
        fileSize: file.size,
        _isSending: true,
        tempId: tempId,
        receiver: "", // Add required receiver property
      };

      setMessages((prevMessages) => [...prevMessages, newMessage]);

      // Emit message via socket - ONLY use sendGroupMessage to avoid duplicates
      let messageSent = false;
      if (socket && socket.connected) {
        try {
          console.log("Socket connected, sending file message via socket");
          const messageData = {
            groupId: groupId,
            roomId: `group:${groupId}`,
            content: file.name,
            sender: user._id,
            type: fileType,
            fileUrl: fileData.fileUrl,
            fileName: file.name,
            fileSize: file.size,
            tempId: tempId,
          };

          // Only emit with one event type to avoid duplicates
          socket.emit("sendGroupMessage", messageData);

          messageSent = true;
        } catch (socketError) {
          console.error("Error sending via socket:", socketError);
        }
      }

      // API fallback if socket fails
      if (!messageSent) {
        try {
          await sendMessageViaAPI(
            {
              groupId: groupId,
              content: file.name,
              type: fileType,
              fileUrl: fileData.fileUrl,
              fileName: file.name,
              fileSize: file.size,
            },
            tempId
          );
        } catch (apiError) {
          console.error("API fallback failed:", apiError);
        }
      }

      if (messagesEndRef.current) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    } catch (error) {
      console.error("File upload error:", error);
      setError(`Upload failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const renderMessages = () => {
    if (messages.length === 0) {
      return (
        <div className="no-messages">
          <p>Hãy bắt đầu cuộc trò chuyện</p>
        </div>
      );
    }

    return messages.map((message) => {
      let sender: MessageSender = { _id: "", name: "Unknown User" };

      if (typeof message.sender === "object" && message.sender !== null) {
        sender = {
          _id: message.sender._id,
          name: message.sender.name || "Unknown User",
          avt: message.sender.avt,
        };
      } else if (typeof message.sender === "string" && group) {
        const memberInfo = group.members.find((m) => m._id === message.sender);
        if (memberInfo) {
          sender = {
            _id: memberInfo._id,
            name: memberInfo.name,
            avt: memberInfo.avt,
          };
        } else {
          sender = { _id: message.sender as string, name: "Unknown User" };
        }
      }

      const isOwnMessage = sender._id === user?._id;
      const isMessageUnsent = message.isUnsent || message.unsent;
      const isMessageSending = message._isSending;

      return (
        <div
          key={message._id}
          data-message-id={message._id}
          className={`message ${isOwnMessage ? "sent" : "received"} ${
            isMessageUnsent ? "unsent" : ""
          } ${message.type === "system" ? "system-message" : ""}`}
          onContextMenu={(e) => {
            e.preventDefault();
            handleLongPress(message);
          }}
        >
          {/* Hiển thị tên người gửi ở tin nhắn không phải của mình */}
          {!isOwnMessage && message.type !== "system" && (
            <div className="sender-name">{sender.name}</div>
          )}

          {/* Hiển thị tin nhắn đang trả lời nếu có */}
          {message.replyTo && (
            <div className="reply-content">
              <div className="reply-indicator"></div>
              <div className="reply-text">
                <span className="reply-sender">
                  {message.replyTo.sender === user?._id
                    ? "Bạn"
                    : group?.members.find((m) => {
                        if (typeof message.replyTo?.sender === "string") {
                          return m._id === message.replyTo.sender;
                        } else if (
                          message.replyTo?.sender &&
                          typeof message.replyTo.sender === "object"
                        ) {
                          return m._id === message.replyTo.sender._id;
                        }
                        return false;
                      })?.name || "Unknown"}
                </span>
                <p>{message.replyTo.content}</p>
              </div>
            </div>
          )}

          <div className="message-content">
            {message.type === "system" ? (
              <div className="system-message-content">{message.content}</div>
            ) : !isMessageUnsent ? (
              renderMessageContent(
                message,
                openMediaPreview,
                handleDownloadFile
              )
            ) : (
              <span className="unsent-message">Tin nhắn đã bị thu hồi</span>
            )}

            {/* Nút hiển thị khi hover */}
            {!isMessageUnsent && message.type !== "system" && (
              <div className="message-hover-actions">
                <button
                  className="hover-action-button reply-button"
                  onClick={() => handleReply(message)}
                  title="Trả lời"
                >
                  ↩️
                </button>
                <button
                  className="hover-action-button reaction-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEmojiPicker(message);
                  }}
                  title="Thả cảm xúc"
                >
                  😀
                </button>

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
                    💾
                  </button>
                )}

                {/* Always show delete button for all messages */}
                <button
                  className="hover-action-button delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMessage(message);
                  }}
                  title="Tùy chọn xóa tin nhắn"
                >
                  🗑️
                </button>
              </div>
            )}
          </div>

          {/* Hiển thị reactions */}
          {renderReactions(message)}

          <div className="message-info">
            <span className="message-time">
              {formatTime(message.createdAt)}
              {isMessageSending && (
                <span className="sending-indicator"> (đang gửi...)</span>
              )}
            </span>
          </div>

          {/* Menu tương tác khi chọn tin nhắn */}
          {selectedMessage?._id === message._id &&
            !showEmojiPicker &&
            !isMessageUnsent &&
            message.type !== "system" && (
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

                {/* Always show delete button for all messages */}
                <button
                  className="action-button"
                  onClick={() => handleDeleteMessage(message)}
                >
                  🗑️ Tùy chọn xóa
                </button>

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
            !isMessageUnsent &&
            message.type !== "system" && (
              <div className="emoji-picker">
                {commonEmojis.map((item) => (
                  <button
                    key={item.emoji}
                    className="emoji-button"
                    onClick={() => handleReaction(item.emoji)}
                    title={item.label}
                  >
                    {item.emoji}
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
      );
    });
  };

  const handleLongPress = (message: GroupMessage) => {
    if (selectedMessage && selectedMessage._id === message._id) {
      setSelectedMessage(null);
      setShowEmojiPicker(false);
    } else {
      setSelectedMessage(message);
      setShowEmojiPicker(false);
    }
  };

  const handleReply = (message: GroupMessage) => {
    setReplyToMessage(message);
    setIsReplying(true);
    setSelectedMessage(null);
    const input = document.querySelector(
      ".message-form input"
    ) as HTMLInputElement;
    if (input) input.focus();
  };

  const cancelReply = () => {
    setReplyToMessage(null);
    setIsReplying(false);
  };

  const openEmojiPicker = (message: GroupMessage) => {
    setSelectedMessage(message);
    setShowEmojiPicker(true);
  };

  const handleReaction = (emoji: string) => {
    if (!selectedMessage || !socket || !user || !groupId) return;

    // Emit the reaction to the server
    socket.emit("addGroupReaction", {
      messageId: selectedMessage._id,
      userId: user._id,
      emoji: emoji,
      groupId: groupId,
    });

    // Also send as groupMessageReaction for compatibility with mobile
    socket.emit("groupMessageReaction", {
      messageId: selectedMessage._id,
      userId: user._id,
      emoji: emoji,
      groupId: groupId,
    });

    // Update the UI immediately
    setMessages((prevMessages) =>
      prevMessages.map((msg) =>
        msg._id === selectedMessage._id
          ? {
              ...msg,
              reactions: {
                ...(msg.reactions || {}),
                [user._id]: emoji,
              },
            }
          : msg
      )
    );

    // Close the emoji picker
    setSelectedMessage(null);
    setShowEmojiPicker(false);
  };

  const handleDownloadFile = (message: GroupMessage) => {
    if (message.fileUrl) {
      window.open(message.fileUrl, "_blank");
    }
  };

  const toggleAttachMenu = () => {
    setShowAttachMenu((prev) => !prev);
  };

  const handleFileTypeSelect = (type: "image" | "video" | "audio" | "file") => {
    if (fileInputRef.current) {
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

  const openMediaPreview = (message: GroupMessage) => {
    if (message.type && ["image", "video", "audio"].includes(message.type)) {
      setMediaPreview(message);
    }
  };

  const handleDeleteMessage = async (message: GroupMessage) => {
    if (!socket || !user || !groupId) return;

    setSelectedMessageForDelete(message);
    setShowDeleteOptionsDialog(true);
  };

  const deleteMessageForEveryone = async () => {
    if (!selectedMessageForDelete || !socket || !user || !groupId) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API_ENDPOINT}/groups/message/${selectedMessageForDelete._id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { deleteType: "everyone" },
        }
      );

      // Update UI immediately
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg._id === selectedMessageForDelete._id
            ? {
                ...msg,
                content: "Tin nhắn đã bị thu hồi",
                isUnsent: true,
                unsent: true,
              }
            : msg
        )
      );

      // Emit to server using multiple event types for cross-platform compatibility
      socket.emit("deleteGroupMessage", {
        messageId: selectedMessageForDelete._id,
        userId: user._id,
        groupId: groupId,
        deleteType: "everyone",
      });

      // Also emit with messageDeleted for compatibility with mobile
      socket.emit("groupMessageDeleted", {
        messageId: selectedMessageForDelete._id,
        deletedBy: user._id,
        groupId: groupId,
        deleteType: "everyone",
      });

      // Close dialog and clear selected message
      setShowDeleteOptionsDialog(false);
      setSelectedMessageForDelete(null);
    } catch (error) {
      console.error("Error deleting message:", error);
      showToast("Lỗi khi xóa tin nhắn", "error");
    }
  };

  const deleteMessageForMe = async () => {
    if (!selectedMessageForDelete || !user || !groupId) return;

    try {
      // First, store this message ID in localStorage to remember it was deleted
      const storageKey = `deleted_messages_${user._id}`;
      const existingDataStr = localStorage.getItem(storageKey);
      let deletedMessages = existingDataStr ? JSON.parse(existingDataStr) : {};

      // Group deleted messages by group ID
      if (!deletedMessages[groupId]) {
        deletedMessages[groupId] = [];
      }

      if (!deletedMessages[groupId].includes(selectedMessageForDelete._id)) {
        deletedMessages[groupId].push(selectedMessageForDelete._id);
      }

      // Save back to localStorage
      localStorage.setItem(storageKey, JSON.stringify(deletedMessages));
      console.log(
        `Saved message ${selectedMessageForDelete._id} as locally deleted`
      );

      // Remove message from UI
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg._id !== selectedMessageForDelete._id)
      );

      // Try to emit a socket event in case server supports this
      if (socket && socket.connected) {
        socket.emit("deleteMessageForMe", {
          messageId: selectedMessageForDelete._id,
          userId: user._id,
          groupId: groupId,
        });
      }

      // Close dialog and clear selected message
      setShowDeleteOptionsDialog(false);
      setSelectedMessageForDelete(null);

      showToast("Đã xóa tin nhắn", "success");
    } catch (error) {
      console.error("Error deleting message for me:", error);
      showToast(
        `Lỗi khi xóa tin nhắn: ${
          error.response?.data?.message || error.message || "Unknown error"
        }`,
        "error"
      );
    }
  };

  const fetchMediaFiles = () => {
    const media = messages
      .filter(
        (message) =>
          message.type &&
          ["image", "video", "audio", "file"].includes(message.type) &&
          message.fileUrl &&
          !message.isUnsent &&
          !message.unsent
      )
      .map((message) => ({
        _id: message._id,
        type: message.type as "image" | "video" | "audio" | "file",
        fileUrl: message.fileUrl || "",
        fileName: message.fileName || "Tệp không tên",
        fileThumbnail: message.fileThumbnail,
        createdAt: message.createdAt,
        sender:
          typeof message.sender === "object"
            ? message.sender._id
            : message.sender,
      }));

    console.log("Đã tìm thấy", media.length, "file media");
    setMediaFiles(media);
  };

  const handleTransferAdminRole = async () => {
    if (!transferToUserId || !groupId || !user) return;

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_ENDPOINT}/groups/transfer-admin`,
        {
          groupId,
          newAdminId: transferToUserId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (socket) {
        socket.emit("adminTransferred", {
          groupId,
          oldAdminId: user._id,
          newAdminId: transferToUserId,
        });
      }

      await handleLeaveAfterTransfer();
    } catch (error) {
      console.error("Error transferring admin role:", error);
      alert("Không thể chuyển quyền quản trị. Vui lòng thử lại sau.");
    }
  };

  const handleLeaveAfterTransfer = async () => {
    if (!user || !groupId) return;

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_ENDPOINT}/groups/remove-member`,
        {
          groupId,
          memberId: user._id,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (socket) {
        socket.emit("memberRemovedFromGroup", {
          groupId,
          memberId: user._id,
        });
      }

      window.location.href = "/";
    } catch (error) {
      console.error("Error leaving group:", error);
    }
  };

  const handleLeaveGroup = async () => {
    if (!user || !groupId) return;

    const confirmed = await showConfirmDialog(
      "Bạn có chắc chắn muốn rời khỏi nhóm này không?"
    );
    if (!confirmed) return;

    if (userRole === "admin") {
      setShowTransferAdminDialog(true);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API_ENDPOINT}/groups/remove-member`,
        {
          groupId,
          memberId: user._id,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (socket) {
        socket.emit("memberRemovedFromGroup", {
          groupId,
          memberId: user._id,
        });
      }

      alert("Bạn đã rời khỏi nhóm thành công!");
      window.location.href = "/";
    } catch (error) {
      console.error("Error leaving group:", error);
      if (
        error.response &&
        error.response.data &&
        error.response.data.message
      ) {
        alert(`Lỗi: ${error.response.data.message}`);
      } else {
        alert("Không thể rời nhóm. Vui lòng thử lại sau.");
      }
    }
  };

  const handleDeleteGroup = async () => {
    if (!user || !groupId) return;

    const confirmed = await showConfirmDialog(
      "Bạn có chắc chắn muốn xóa nhóm này không? Hành động này không thể hoàn tác."
    );

    if (!confirmed) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API_ENDPOINT}/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (socket) {
        socket.emit("groupDissolved", {
          groupId,
          dissolvedBy: user._id,
        });
      }

      window.location.href = "/";
    } catch (error) {
      console.error("Error deleting group:", error);
    }
  };

  const handleEditGroupName = () => {
    if (group) {
      setNewGroupName(group.name);
      setShowEditNameDialog(true);
    }
  };

  // Hàm tìm kiếm tin nhắn trong nhóm
  const handleSearchMessages = () => {
    if (!searchQuery.trim()) {
      setSearchMessageResults([]);
      return;
    }

    const results = messages.filter((message) =>
      message.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    setSearchMessageResults(results);
    console.log("Kết quả tìm kiếm:", results);
  };

  // Add these handlers for avatar functionality
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile || !group) return;

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("avatar", avatarFile);

      const token = localStorage.getItem("token");
      const response = await axios.put(
        `${API_ENDPOINT}/groups/${group._id}/avatar`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (response.data && response.data.group) {
        setGroup(response.data.group);
        showToast("Ảnh nhóm đã được cập nhật thành công");
      }

      // Close dialog and reset
      setShowEditAvatarDialog(false);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (error) {
      console.error("Error updating group avatar:", error);
      showToast("Lỗi khi cập nhật ảnh nhóm", "error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="chat-loading">Loading group chat...</div>;
  }

  if (error) {
    return <div className="chat-error">{error}</div>;
  }

  if (!group) {
    return <div className="chat-error">Group not found</div>;
  }

  const typingMembers = Array.from(typingUsers.values());

  function handleManageCoAdmins(
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ): void {
    event.preventDefault();
    setShowManageCoAdminDialog(true);
  }

  return (
    <div className="group-chat-interface">
      <div className="chat-header">
        <div className="group-info">
          <div className="group-avatar">
            {group.avatarUrl ? (
              <img
                src={group.avatarUrl}
                alt={group.name}
                onClick={() => setShowEditAvatarDialog(true)}
                className="clickable-avatar"
              />
            ) : (
              <div
                className="avatar-placeholder clickable-avatar"
                onClick={() => setShowEditAvatarDialog(true)}
              >
                {group.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="group-details">
            <h3 className="group-name">{group.name}</h3>
            <div className="group-members-count">
              {group.members.length} thành viên
              {group.members.length > 0 && (
                <span className="online-members">
                  •{" "}
                  {
                    Array.from(onlineUsers).filter((id) =>
                      group.members.some((member) =>
                        typeof member === "object"
                          ? member._id === id
                          : member === id
                      )
                    ).length
                  }{" "}
                  online
                </span>
              )}
            </div>
          </div>
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
                onClick={() => setShowMembersList(true)}
              >
                <FiUsers /> Xem thành viên nhóm
              </button>
              {(userRole === "admin" || userRole === "coAdmin") && (
                <>
                  <button
                    className="option-button"
                    onClick={handleEditGroupName}
                  >
                    <FiSettings /> Chỉnh sửa tên nhóm
                  </button>
                  <button
                    className="option-button"
                    onClick={() => setShowAddMemberDialog(true)}
                  >
                    <FiUserPlus /> Thêm thành viên
                  </button>
                  <button
                    className="option-button"
                    onClick={() => setShowRemoveMemberDialog(true)}
                  >
                    <FiUserX /> Xóa thành viên
                  </button>
                  {userRole === "admin" && (
                    <button
                      className="option-button"
                      onClick={handleManageCoAdmins}
                    >
                      <FiUserCheck /> Quản lý phó nhóm
                    </button>
                  )}
                </>
              )}
              <button
                className="option-button danger"
                onClick={handleLeaveGroup}
              >
                <FiArchive /> Rời nhóm
              </button>
              {userRole === "admin" && (
                <button
                  className="option-button danger"
                  onClick={handleDeleteGroup}
                >
                  <FiTrash2 /> Xóa nhóm
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showMembersList && (
        <div
          className="modal-overlay"
          onClick={() => setShowMembersList(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Group Members ({group.members.length})</h3>
              <button
                className="close-button"
                onClick={() => setShowMembersList(false)}
              >
                <FiX />
              </button>
            </div>
            <div className="members-list">
              {group.members.map((member) => {
                const memberId =
                  typeof member === "object" ? member._id : member;
                const memberName =
                  typeof member === "object" ? member.name : "Unknown";
                const memberAvt =
                  typeof member === "object" ? member.avt : null;
                const isAdmin =
                  typeof group.admin === "object"
                    ? group.admin._id === memberId
                    : group.admin === memberId;
                const isCoAdmin =
                  Array.isArray(group.coAdmins) &&
                  group.coAdmins.includes(memberId);
                const isOnline = onlineUsers.has(memberId);

                const canRemoveMember =
                  (userRole === "admin" && memberId !== user?._id) ||
                  (userRole === "coAdmin" &&
                    !isAdmin &&
                    !isCoAdmin &&
                    memberId !== user?._id);

                return (
                  <div key={memberId} className="member-item">
                    <div className="member-avatar">
                      {memberAvt ? (
                        <img src={memberAvt} alt={memberName} />
                      ) : (
                        <div className="avatar-placeholder">
                          {memberName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {isOnline && <div className="online-indicator"></div>}
                    </div>
                    <div className="member-info">
                      <div className="member-name">
                        {memberName}
                        {memberId === user?._id && " (You)"}
                        {isAdmin && (
                          <span className="role-badge admin">Admin</span>
                        )}
                        {isCoAdmin && (
                          <span className="role-badge co-admin">Co-Admin</span>
                        )}
                      </div>
                    </div>

                    {canRemoveMember && (
                      <button
                        className="remove-button"
                        onClick={async () => {
                          const confirmed = await showConfirmDialog(
                            `Bạn có chắc chắn muốn xóa ${memberName} khỏi nhóm?`
                          );

                          if (!confirmed) return;

                          try {
                            const token = localStorage.getItem("token");
                            await axios.post(
                              `${API_ENDPOINT}/groups/remove-member`,
                              {
                                groupId,
                                memberId,
                              },
                              {
                                headers: { Authorization: `Bearer ${token}` },
                              }
                            );

                            if (socket) {
                              socket.emit("memberRemovedFromGroup", {
                                groupId,
                                memberId,
                                removedBy: user?._id,
                              });
                            }

                            fetchGroupInfo();

                            alert(`Đã xóa ${memberName} khỏi nhóm`);
                          } catch (error) {
                            console.error("Error removing member:", error);
                            alert(
                              "Không thể xóa thành viên. Vui lòng thử lại sau."
                            );
                          }
                        }}
                      >
                        <FiUserX /> Xóa
                      </button>
                    )}

                    {userRole === "admin" && !isAdmin && !isCoAdmin && (
                      <button
                        className="promote-button"
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem("token");
                            await axios.post(
                              `${API_ENDPOINT}/groups/add-co-admin`,
                              {
                                groupId,
                                userId: memberId,
                              },
                              {
                                headers: { Authorization: `Bearer ${token}` },
                              }
                            );

                            if (socket) {
                              socket.emit("addCoAdmin", {
                                groupId,
                                userId: memberId,
                                addedBy: user?._id,
                              });
                            }

                            fetchGroupInfo();

                            alert(`Đã thăng cấp ${memberName} làm phó nhóm`);
                          } catch (error) {
                            console.error("Error adding co-admin:", error);
                          }
                        }}
                      >
                        <FiUserCheck /> Thăng cấp
                      </button>
                    )}

                    {userRole === "admin" && isCoAdmin && (
                      <button
                        className="demote-button"
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem("token");
                            await axios.post(
                              `${API_ENDPOINT}/groups/remove-co-admin`,
                              {
                                groupId,
                                userId: memberId,
                              },
                              {
                                headers: { Authorization: `Bearer ${token}` },
                              }
                            );

                            if (socket) {
                              socket.emit("removeCoAdmin", {
                                groupId,
                                userId: memberId,
                                removedBy: user?._id,
                              });
                            }

                            fetchGroupInfo();

                            alert(
                              `Đã hạ cấp ${memberName} xuống thành viên thường`
                            );
                          } catch (error) {
                            console.error("Error removing co-admin:", error);
                          }
                        }}
                      >
                        <FiUserX /> Hạ cấp
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showAddMemberDialog && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddMemberDialog(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Members</h3>
              <button
                className="close-button"
                onClick={() => setShowAddMemberDialog(false)}
              >
                <FiX />
              </button>
            </div>
            <div className="search-container">
              <input
                type="text"
                placeholder="Search users..."
                value={newMemberSearch}
                onChange={(e) => setNewMemberSearch(e.target.value)}
              />
              <button
                className="search-button"
                onClick={() => {
                  const searchUsers = async () => {
                    try {
                      const token = localStorage.getItem("token");
                      const response = await axios.get(
                        `${API_ENDPOINT}/search/users?query=${newMemberSearch}`,
                        {
                          headers: { Authorization: `Bearer ${token}` },
                        }
                      );
                      const filteredResults = response.data.filter(
                        (user: any) =>
                          !group.members.some((member) =>
                            typeof member === "object"
                              ? member._id === user._id
                              : member === user._id
                          )
                      );
                      setSearchResults(filteredResults);
                    } catch (error) {
                      console.error("Error searching users:", error);
                    }
                  };

                  if (newMemberSearch.trim()) {
                    searchUsers();
                  }
                }}
              >
                Search
              </button>
            </div>
            <div className="search-results">
              {searchResults.map((user) => (
                <div key={user._id} className="user-item">
                  <div className="user-avatar">
                    {user.avt ? (
                      <img src={user.avt} alt={user.name} />
                    ) : (
                      <div className="avatar-placeholder">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="user-info">
                    <div className="user-name">{user.name}</div>
                    <div className="user-email">{user.email}</div>
                  </div>
                  <button
                    className="add-button"
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem("token");
                        await axios.post(
                          `${API_ENDPOINT}/groups/add-member`,
                          {
                            groupId,
                            memberId: user._id,
                          },
                          {
                            headers: { Authorization: `Bearer ${token}` },
                          }
                        );

                        if (socket) {
                          socket.emit("addMemberToGroup", {
                            groupId,
                            memberId: user._id,
                            addedBy: user?._id,
                          });
                        }

                        fetchGroupInfo();
                        setShowAddMemberDialog(false);
                      } catch (error) {
                        console.error("Error adding member:", error);
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              ))}
              {searchResults.length === 0 && newMemberSearch && (
                <div className="no-results">No users found</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteOptionsDialog && selectedMessageForDelete && (
        <div
          className="modal-overlay"
          onClick={() => setShowDeleteOptionsDialog(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Xóa tin nhắn</h3>
              <button
                className="close-button"
                onClick={() => setShowDeleteOptionsDialog(false)}
              >
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>Bạn muốn xóa tin nhắn này như thế nào?</p>
              <div className="delete-options">
                {/* Always show "Delete for me only" option for all messages */}
                <button className="delete-option" onClick={deleteMessageForMe}>
                  Xóa chỉ với tôi
                </button>

                {/* Only show "Delete for everyone" if the user is the sender or has admin permissions */}
                {(isMessageFromCurrentUser(
                  selectedMessageForDelete,
                  user?._id
                ) ||
                  userRole === "admin" ||
                  userRole === "coAdmin") && (
                  <button
                    className="delete-option delete-for-everyone"
                    onClick={deleteMessageForEveryone}
                  >
                    Thu hồi với mọi người
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditNameDialog && (
        <div
          className="modal-overlay"
          onClick={() => setShowEditNameDialog(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Group Name</h3>
              <button
                className="close-button"
                onClick={() => setShowEditNameDialog(false)}
              >
                <FiX />
              </button>
            </div>
            <div className="edit-name-form">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Enter new group name"
              />
              <div className="button-group">
                <button
                  className="cancel-button"
                  onClick={() => setShowEditNameDialog(false)}
                >
                  Cancel
                </button>
                <button
                  className="save-button"
                  onClick={async () => {
                    if (!newGroupName.trim()) return;

                    try {
                      const token = localStorage.getItem("token");
                      await axios.put(
                        `${API_ENDPOINT}/groups/${groupId}`,
                        {
                          name: newGroupName,
                        },
                        {
                          headers: { Authorization: `Bearer ${token}` },
                        }
                      );

                      setGroup((prev) =>
                        prev ? { ...prev, name: newGroupName } : null
                      );
                      setShowEditNameDialog(false);

                      if (socket) {
                        socket.emit("groupUpdated", {
                          groupId,
                          updatedBy: user?._id,
                          userName: user?.name,
                          newGroupName: newGroupName,
                          action: "rename",
                        });

                        // Tạo tin nhắn thông báo trong nhóm
                        const systemMessage = {
                          _id: Date.now().toString(),
                          sender: "system",
                          groupId: groupId,
                          content: `${user?.name} đã thay đổi tên nhóm thành "${newGroupName}"`,
                          createdAt: new Date().toISOString(),
                          type: "system",
                        };

                        setMessages((prev) => [
                          ...prev,
                          systemMessage as GroupMessage,
                        ]);
                      }

                      // Hiển thị thông báo thành công
                      await showAlertDialog("Đã cập nhật tên nhóm thành công!");
                    } catch (error) {
                      console.error("Error updating group name:", error);
                      // Hiển thị thông báo lỗi
                      if (
                        error.response &&
                        error.response.data &&
                        error.response.data.message
                      ) {
                        await showAlertDialog(
                          `Lỗi: ${error.response.data.message}`
                        );
                      } else {
                        await showAlertDialog(
                          "Không thể cập nhật tên nhóm. Vui lòng thử lại sau."
                        );
                      }
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showManageCoAdminDialog && group && user && socket && (
        <CoAdminDialog
          isOpen={showManageCoAdminDialog}
          groupId={groupId || ""}
          group={group}
          userId={user._id}
          onClose={() => setShowManageCoAdminDialog(false)}
          onCoAdminUpdated={fetchGroupInfo}
          socket={socket}
        />
      )}

      {showRemoveMemberDialog && (
        <div
          className="modal-overlay"
          onClick={() => setShowRemoveMemberDialog(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Members</h3>
              <button
                className="close-button"
                onClick={() => setShowRemoveMemberDialog(false)}
              >
                <FiX />
              </button>
            </div>
            <div className="remove-member-section">
              <p className="info-text">
                Select members to remove from the group
              </p>
              <div className="members-list">
                {group.members
                  .filter((member) => {
                    const memberId =
                      typeof member === "object" ? member._id : member;

                    if (userRole === "admin") {
                      return memberId !== user?._id;
                    }

                    const isAdmin =
                      typeof group.admin === "object"
                        ? group.admin._id === memberId
                        : group.admin === memberId;
                    const isCoAdmin =
                      Array.isArray(group.coAdmins) &&
                      group.coAdmins.includes(memberId);

                    return !isAdmin && !isCoAdmin && memberId !== user?._id;
                  })
                  .map((member) => {
                    const memberId =
                      typeof member === "object" ? member._id : member;
                    const memberName =
                      typeof member === "object" ? member.name : "Unknown";
                    const memberAvt =
                      typeof member === "object" ? member.avt : null;
                    const isOnline = onlineUsers.has(memberId);

                    return (
                      <div key={memberId} className="member-item">
                        <div className="member-avatar">
                          {memberAvt ? (
                            <img src={memberAvt} alt={memberName} />
                          ) : (
                            <div className="avatar-placeholder">
                              {memberName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {isOnline && <div className="online-indicator"></div>}
                        </div>
                        <div className="member-info">
                          <div className="member-name">{memberName}</div>
                        </div>
                        <button
                          className="remove-button"
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem("token");
                              await axios.post(
                                `${API_ENDPOINT}/groups/remove-member`,
                                {
                                  groupId,
                                  memberId,
                                },
                                {
                                  headers: { Authorization: `Bearer ${token}` },
                                }
                              );

                              if (socket) {
                                socket.emit("memberRemovedFromGroup", {
                                  groupId,
                                  memberId,
                                  removedBy: user?._id,
                                });
                              }

                              fetchGroupInfo();

                              alert(`Đã xóa ${memberName} khỏi nhóm`);
                            } catch (error) {
                              console.error("Error removing member:", error);
                              alert(
                                "Không thể xóa thành viên. Vui lòng thử lại sau."
                              );
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
              </div>
              <div className="button-group">
                <button
                  className="cancel-button"
                  onClick={() => setShowRemoveMemberDialog(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="chat-messages" ref={messagesContainerRef}>
        {renderMessages()}
        {typingMembers.length > 0 && (
          <div className="typing-indicator">
            <span>
              {typingMembers.length === 1
                ? `${typingMembers[0]} is typing...`
                : typingMembers.length === 2
                ? `${typingMembers[0]} and ${typingMembers[1]} are typing...`
                : `${typingMembers.length} people are typing...`}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {isReplying && replyToMessage && (
        <ReplyBar
          replyToMessage={replyToMessage}
          friend={null}
          user={user}
          cancelReply={cancelReply}
        />
      )}

      <div className="chat-input-container">
        <form onSubmit={handleSendMessage} className="message-form">
          <div className="attach-menu-container">
            <button
              type="button"
              className="attach-button"
              onClick={toggleAttachMenu}
            >
              <FiPaperclip />
            </button>

            {showAttachMenu && (
              <div className="attach-menu">
                <button
                  type="button"
                  onClick={() => handleFileTypeSelect("image")}
                  className="attach-option image"
                >
                  <FiImage />
                  <span>Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFileTypeSelect("video")}
                  className="attach-option video"
                >
                  <FiVideo />
                  <span>Video</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFileTypeSelect("audio")}
                  className="attach-option audio"
                >
                  <FiMusic />
                  <span>Audio</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFileTypeSelect("file")}
                  className="attach-option document"
                >
                  <FiFileText />
                  <span>Document</span>
                </button>
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
          </div>

          <input
            type="text"
            placeholder={
              isReplying ? "Type your reply..." : "Type a message..."
            }
            value={newMessage}
            onChange={handleTyping}
            disabled={isUploading}
            className="chat-input"
          />

          <button
            type="submit"
            disabled={!newMessage.trim() || isUploading}
            className="send-button"
          >
            <FiSend />
          </button>
        </form>
      </div>

      <MediaPreview
        mediaPreview={mediaPreview}
        closeMediaPreview={() => setMediaPreview(null)}
      />

      {isUploading && (
        <div className="upload-overlay">
          <div className="upload-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className="progress-text">{uploadProgress}%</div>
          </div>
        </div>
      )}

      {showTransferAdminDialog && (
        <div
          className="modal-overlay"
          onClick={() => setShowTransferAdminDialog(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Chuyển quyền nhóm trưởng</h3>
              <button
                className="close-button"
                onClick={() => setShowTransferAdminDialog(false)}
              >
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Bạn cần chọn một thành viên để chuyển quyền nhóm trưởng trước
                khi rời nhóm.
              </p>

              <div className="members-list">
                {group?.members
                  .filter((member) => {
                    const memberId =
                      typeof member === "object" ? member._id : member;
                    return memberId !== user?._id;
                  })
                  .map((member) => {
                    const memberId =
                      typeof member === "object" ? member._id : member;
                    const memberName =
                      typeof member === "object" ? member.name : "Unknown";
                    const memberAvt =
                      typeof member === "object" ? member.avt : null;
                    const isCoAdmin =
                      Array.isArray(group?.coAdmins) &&
                      group?.coAdmins.includes(memberId);

                    return (
                      <div key={memberId} className="member-item">
                        <div className="member-avatar">
                          {memberAvt ? (
                            <img src={memberAvt} alt={memberName} />
                          ) : (
                            <div className="avatar-placeholder">
                              {memberName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="member-info">
                          <div className="member-name">
                            {memberName}
                            {isCoAdmin && (
                              <span className="role-badge co-admin">
                                Phó nhóm
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          className={`select-admin-button ${
                            transferToUserId === memberId ? "selected" : ""
                          }`}
                          onClick={() => setTransferToUserId(memberId)}
                        >
                          {transferToUserId === memberId ? "Đã chọn" : "Chọn"}
                        </button>
                      </div>
                    );
                  })}
              </div>

              <div className="button-group">
                <button
                  className="cancel-button"
                  onClick={() => setShowTransferAdminDialog(false)}
                >
                  Hủy
                </button>
                <button
                  className="confirm-button"
                  disabled={!transferToUserId}
                  onClick={handleTransferAdminRole}
                >
                  Chuyển quyền và rời nhóm
                </button>
              </div>

              <div className="auto-select-note">
                <p>
                  <i>
                    Ghi chú: Nếu có phó nhóm, chúng tôi khuyến nghị bạn nên chọn
                    một phó nhóm làm nhóm trưởng mới.
                  </i>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Dialog */}
      {showSearchDialog && (
        <div className="search-dialog">
          <div className="search-header">
            <h3>Tìm kiếm tin nhắn</h3>
            <button
              className="close-button"
              onClick={() => {
                setShowSearchDialog(false);
                setSearchQuery("");
                setSearchMessageResults([]);
              }}
            >
              <FiX />
            </button>
          </div>
          <div className="search-form">
            <input
              type="text"
              placeholder="Nhập nội dung tìm kiếm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyUp={(e) => e.key === "Enter" && handleSearchMessages()}
            />
            <button className="search-button" onClick={handleSearchMessages}>
              <FiSearch /> Tìm kiếm
            </button>
          </div>
          <div className="search-results">
            {searchMessageResults.length === 0 ? (
              searchQuery.trim() ? (
                <p className="no-results">Không tìm thấy kết quả phù hợp</p>
              ) : (
                <p className="instruction">Nhập từ khóa để tìm kiếm tin nhắn</p>
              )
            ) : (
              <div className="results-list">
                <div className="results-count">
                  Tìm thấy {searchMessageResults.length} kết quả
                </div>
                {searchMessageResults.map((result) => {
                  const sender =
                    typeof result.sender === "object"
                      ? result.sender.name
                      : group?.members.find(
                          (m) =>
                            typeof m === "object" && m._id === result.sender
                        )?.name || "Unknown";

                  return (
                    <div
                      key={result._id}
                      className="search-result-item"
                      onClick={() => {
                        // Cuộn đến tin nhắn khi click vào kết quả
                        const messageEl = document.querySelector(
                          `[data-message-id="${result._id}"]`
                        );
                        if (messageEl) {
                          messageEl.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                          messageEl.classList.add("highlight");
                          setTimeout(() => {
                            messageEl.classList.remove("highlight");
                          }, 2000);
                        }
                        setShowSearchDialog(false);
                      }}
                    >
                      <div className="result-sender">{sender}</div>
                      <div className="result-content">{result.content}</div>
                      <div className="result-time">
                        {formatTime(result.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showMediaGallery && (
        <div
          className="modal-overlay"
          onClick={() => setShowMediaGallery(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Thư viện media</h3>
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
                onClick={() => setSelectedMediaType("all")}
              >
                Tất cả
              </button>
              <button
                className={`filter-button ${
                  selectedMediaType === "image" ? "active" : ""
                }`}
                onClick={() => setSelectedMediaType("image")}
              >
                Hình ảnh
              </button>
              <button
                className={`filter-button ${
                  selectedMediaType === "video" ? "active" : ""
                }`}
                onClick={() => setSelectedMediaType("video")}
              >
                Video
              </button>
              <button
                className={`filter-button ${
                  selectedMediaType === "audio" ? "active" : ""
                }`}
                onClick={() => setSelectedMediaType("audio")}
              >
                Âm thanh
              </button>
              <button
                className={`filter-button ${
                  selectedMediaType === "file" ? "active" : ""
                }`}
                onClick={() => setSelectedMediaType("file")}
              >
                Tài liệu
              </button>
            </div>
            <div className="media-items-container">
              {mediaFiles.length === 0 ? (
                <div className="no-media-found">
                  Không tìm thấy file media nào trong nhóm
                </div>
              ) : (
                <div className="media-items">
                  {mediaFiles
                    .filter(
                      (file) =>
                        selectedMediaType === "all" ||
                        file.type === selectedMediaType
                    )
                    .map((file) => (
                      <div
                        key={file._id}
                        className="media-item"
                        onClick={() => {
                          // Khi click vào một media, mở nó như một preview
                          const message: any = messages.find(
                            (msg) => msg._id === file._id
                          );
                          if (message) {
                            setMediaPreview(message);
                            setShowMediaGallery(false);
                          }
                        }}
                      >
                        {file.type === "image" && (
                          <div className="media-image-container">
                            <img
                              src={file.fileUrl}
                              alt={file.fileName}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.onerror = null;
                                target.src =
                                  "https://via.placeholder.com/150?text=Lỗi+hình+ảnh";
                              }}
                            />
                          </div>
                        )}
                        {file.type === "video" && (
                          <div className="media-video-container">
                            <div className="video-thumbnail">
                              {file.fileThumbnail ? (
                                <img
                                  src={file.fileThumbnail}
                                  alt="Video thumbnail"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.onerror = null;
                                    target.src =
                                      "https://via.placeholder.com/150?text=Video";
                                  }}
                                />
                              ) : (
                                <div className="video-placeholder">
                                  <FiVideo />
                                </div>
                              )}
                              <div className="play-icon">▶</div>
                            </div>
                          </div>
                        )}
                        {file.type === "audio" && (
                          <div className="media-audio-container">
                            <FiMusic className="audio-icon" />
                            <span className="media-name">{file.fileName}</span>
                          </div>
                        )}
                        {file.type === "file" && (
                          <div className="media-file-container">
                            <FiFileText className="file-icon" />
                            <span className="media-name">{file.fileName}</span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="close-button-large"
                onClick={() => setShowMediaGallery(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog to edit group avatar */}
      {showEditAvatarDialog && group && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowEditAvatarDialog(false);
            setAvatarFile(null);
            setAvatarPreview(null);
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Thay đổi ảnh nhóm</h3>
              <button
                className="close-button"
                onClick={() => {
                  setShowEditAvatarDialog(false);
                  setAvatarFile(null);
                  setAvatarPreview(null);
                }}
              >
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="avatar-preview-container">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="avatar-preview"
                  />
                ) : group.avatarUrl ? (
                  <img
                    src={group.avatarUrl}
                    alt={group.name}
                    className="avatar-preview"
                  />
                ) : (
                  <div className="avatar-placeholder large">
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="avatar-upload-controls">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ display: "none" }}
                  ref={avatarInputRef}
                />
                <button
                  className="btn-upload"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <FiUpload /> Chọn ảnh
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowEditAvatarDialog(false);
                  setAvatarFile(null);
                  setAvatarPreview(null);
                }}
              >
                Hủy
              </button>
              <button
                className="btn-save"
                onClick={handleAvatarUpload}
                disabled={!avatarFile || loading}
              >
                {loading ? "Đang xử lý..." : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupChatInterface;
