import React, { useState, useEffect, useRef, useContext, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { AuthContext } from "../../context/AuthContext";
import * as groupChatService from "../../services/groupChatService";
import socketService from "../../services/socketService";
import { format } from "date-fns";
import uuid from "react-native-uuid";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_URL } from "../../config/constants";
import { Video, ResizeMode } from "expo-av";
import ImageView from "react-native-image-viewing";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as cloudinaryService from "../../services/cloudinaryService";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import AudioPlayer from "../../components/AudioPlayer";
import moment from "moment";
import { FontAwesome5 } from '@expo/vector-icons'; // Use this instead of react-native-vector-icons
import * as groupPermissionService from "../../services/groupPermissionService";
// Thêm import component GroupChatHeader
import GroupChatHeader from "../../components/GroupChatHeader";

interface Message {
  _id: string;
  content: string;
  sender: {
    _id: string;
    name: string;
    avt: string;
  };
  groupId: string;
  createdAt: string;
  type?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  reactions?: Record<string, string>;
  isUnsent?: boolean;
  unsent?: boolean; // Add for backward compatibility
  tempId?: string;
  failed?: boolean;
  roomId?: string;
  replyTo?: {
    _id: string;
    content: string;
    sender: string | {_id: string; name: string};
  };
  // Add additional properties for enhanced cross-platform compatibility
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  file?: {
    url?: string;
    name?: string;
    size?: number;
  };
  // Add properties for web compatibility
  id?: string;
  text?: string;
  messageType?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  timestamp?: string;
  time?: string;
  url?: string;
  name?: string;
  size?: number;
  room?: string;
  reply_to?: any;
  from?: string;
  from_name?: string;
  avatar?: string;
  // Thêm các trường mới cho tương thích hoàn toàn với web
  chatType?: string;
  status?: string;
  read?: boolean;
  delivered?: boolean;
  to?: string;
  recipients?: any[];
  files?: any[];
  message?: string; // Một số triển khai dùng message thay vì content
  data?: any; // Data chứa nội dung tin nhắn trong một số triển khai
  messageId?: string; // ID tin nhắn trong một số triển khai
  attachments?: any[]; // Tệp đính kèm trong một số triển khai
  date?: string; // Ngày dưới dạng chuỗi
  datetime?: string; // Ngày giờ dưới dạng chuỗi
  chat?: string; // ID chat
  seen?: boolean; // Đã xem
  body?: string; // Nội dung tin nhắn trong một số triển khai
}

interface GroupChatParams {
  groupId: string;
  groupName: string;
  groupAvatar?: string;
  returnScreen?: string;
}

interface Recording {
  stopAndUnloadAsync(): Promise<void>;
  getStatusAsync(): Promise<any>;
  getURI(): string | null;
  _cleanupForUnloadedRecorder(): Promise<void>;
}

const GroupChatScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { user } = useContext(AuthContext);
  const { groupId, groupName, groupAvatar, returnScreen } = route.params as GroupChatParams;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isMounted, setIsMounted] = useState(true);
  const [typingUsers, setTypingUsers] = useState<{ [key: string]: string }>({});
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null
  );
  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // Thêm state cho audio
  const [isAudioPreviewVisible, setIsAudioPreviewVisible] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<Message | null>(null);

  // States for message reply feature
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);

  // Add a state variable to track immediate display messages
  const [immediateMessages, setImmediateMessages] = useState<Message[]>([]);

  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<any>(null);
  const recordingRef = useRef<any>(null);

  const [members, setMembers] = useState<any[]>([]);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(groupAvatar || null);
  const [userRole, setUserRole] = useState<string>("member"); // "admin", "co-admin", or "member"

  // Thêm biến theo dõi thời gian đồng bộ cuối cùng
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const AUTO_SYNC_INTERVAL = 5000; // 5 giây

  // Thêm state để kiểm soát làm mới
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastWebMessageTime, setLastWebMessageTime] = useState<number>(0);
  const [localSentMessages, setLocalSentMessages] = useState<Set<string>>(new Set());
  const FORCE_REFRESH_INTERVAL = 3000; // Giảm xuống 3 giây

  // Initialize and load messages
  useEffect(() => {
    setIsMounted(true);
    loadMessages();
    setupSocket();
    checkUserPermissions();

    return () => {
      setIsMounted(false);
      cleanupSocket();
    };
  }, [groupId]);

  // Load group avatar if not provided
  useEffect(() => {
    if (!groupAvatarUrl) {
      loadGroupInfo();
    }
  }, [groupId, groupAvatarUrl]);

  const loadGroupInfo = async () => {
    try {
      // Sử dụng service mới để lấy thông tin nhóm
      const group = await groupPermissionService.getGroupInfo(groupId);
      
      if (group) {
        // Cập nhật UI
        if ((group as any).avatarUrl || group.avatar) {
          setGroupAvatarUrl((group as any).avatarUrl || group.avatar);
        }
        
        if (group.members) {
          setMembers(group.members);
        }
      }
    } catch (error) {
      console.error("Error loading group info:", error);
    }
  };

  // Thêm hàm mới để xác định vai trò người dùng từ dữ liệu nhóm
  const determineUserRole = (group: any) => {
    try {
      console.log("Determining user role from group data...");
      
      // Kiểm tra xem người dùng có phải là admin
      if (group.admin && typeof group.admin === 'object' && group.admin._id === user._id) {
        console.log("User is group admin");
        setUserRole("admin");
        return;
      }
      
      // Kiểm tra xem người dùng có phải là co-admin
      if (group.coAdmins && Array.isArray(group.coAdmins)) {
        const isCoAdmin = group.coAdmins.some(
          (admin: any) => typeof admin === 'object' && admin._id === user._id
        );
        
        if (isCoAdmin) {
          console.log("User is group co-admin");
          setUserRole("co-admin");
          return;
        }
      }
      
      // Nếu không phải admin hay co-admin, thì là thành viên thường
      console.log("User is regular member");
      setUserRole("member");
    } catch (error) {
      console.error("Error determining user role:", error);
      setUserRole("member"); // Mặc định là thành viên thường
    }
  };

  // Thay thế hoàn toàn hàm checkUserPermissions hiện tại bằng phiên bản mới này
  const checkUserPermissions = async () => {
    try {
      // Sử dụng service mới để xác định vai trò
      const role = await groupPermissionService.checkUserPermissions(groupId, user._id);
      setUserRole(role);
    } catch (error) {
      console.error("Error checking permissions:", error);
      setUserRole("member"); // Mặc định nếu có lỗi
    }
  };

  // Add a new effect for scrolling to bottom after initial load
  useEffect(() => {
    if (!loading && messages.length > 0 && initialLoad) {
      scrollToBottomWithDelay(300);
      setInitialLoad(false);
    }
  }, [loading, messages.length, initialLoad]);
  
  // Thêm useEffect để dọn dẹp localSentMessages sau một khoảng thời gian để tránh memory leak
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // Chỉ giữ lại các tin nhắn gửi trong 5 phút gần đây
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      setLocalSentMessages(prev => {
        // Không cần làm gì nếu danh sách trống
        if (prev.size === 0) return prev;
        
        console.log(`Cleaning up local sent messages cache (size: ${prev.size})`);
        return new Set([...prev]);
      });
    }, 300000); // Dọn dẹp mỗi 5 phút
    
    return () => clearInterval(cleanupInterval);
  }, []);

  // Load messages only once when entering the screen
  useEffect(() => {
    if (groupId) {
      // Initial load on mount
      loadMessages();
      
      // Set up socket connection checker
      const socketCheckerInterval = setInterval(() => {
        // Only check if socket is connected, don't reload messages
        if (!socketRef.current || !socketRef.current.connected) {
          console.log("[SOCKET DEBUG] Socket disconnected, reconnecting...");
          setupSocket();
        }
      }, 30000); // Check socket connection every 30 seconds
      
      // Cleanup interval on unmount
      return () => clearInterval(socketCheckerInterval);
    }
  }, [groupId]);

  const setupSocket = async () => {
    try {
      console.log("Setting up socket for group chat:", groupId);
      
      // Get socket instance with more robust retry strategy
      const socket = await socketService.initSocket(true); // Pass true to enable aggressive reconnection
      if (!socket) {
        console.error("Failed to initialize socket");
        return;
      }
      
      socketRef.current = socket;
      
      // Thêm debug listener để theo dõi tất cả các sự kiện
      socket.onAny((event, ...args) => {
        console.log(`[SOCKET DEBUG] Received event: ${event}`, 
          args.length > 0 ? JSON.stringify(args[0]).substring(0, 200) + "..." : "no data");
      });
      
      // Standardize room ID format across platforms
      const standardRoomId = `group:${groupId}`;
      
      // Join with all possible formats to ensure compatibility with web
      socket.emit("joinRoom", { roomId: standardRoomId });
      socket.emit("joinRoom", { roomId: groupId });
      socket.emit("joinGroupRoom", { groupId: groupId });
      socket.emit("join", { room: standardRoomId });
      
      // Thêm các định dạng phòng khác để đảm bảo tương thích
      socket.emit("join", standardRoomId);
      socket.emit("join", groupId);
      
      // Also join user's personal room for direct updates
      socket.emit("joinRoom", { roomId: user._id });
      socket.emit("join", user._id);
      
      // Send explicit room connection verification
      socket.emit("verifyRoomConnection", { 
        roomId: standardRoomId,
        userId: user._id,
        platform: "mobile" 
      });
      
      // Thông báo rõ ràng về việc mobile đã tham gia phòng chat
      socket.emit("mobileClientJoined", {
        groupId: groupId,
        userId: user._id,
        deviceInfo: Platform.OS
      });
      
      // Request missed messages with standard format
      socket.emit("getMissedMessages", { roomId: standardRoomId });
      socket.emit("syncMessages", { groupId: groupId, lastMessageId: messages.length > 0 ? messages[messages.length - 1]._id : null });
      
      // QUAN TRỌNG: KHÔNG xóa tất cả listeners vì điều này có thể ngăn nhận sự kiện
      // Thay vào đó, xóa từng listener riêng lẻ
      socket.off("groupMessage");
      socket.off("groupMediaMessage");
      socket.off("message");
      socket.off("newMessage");
      socket.off("chatMessage");
      socket.off("groupChatMessage");
      socket.off("messageCreated");
      socket.off("notification");
      socket.off("messageUpdate");
      socket.off("refreshRequest");
      socket.off("messageDeleted");
      socket.off("groupMessageDeleted");
      socket.off("messageReaction");
      socket.off("groupMessageReaction");
      socket.off("userTyping");
      socket.off("userStoppedTyping");
      socket.off("roomConnectionVerified");
      socket.off("messageSyncComplete");
      socket.off("incomingWebMessage");
      socket.off("specificMessage");
      
      // Set up enhanced socket listeners with better error handling
      socket.on("groupMessage", (message) => {
        try {
          console.log("Received groupMessage event:", JSON.stringify(message).substring(0, 200));
          handleNewMessage(message);
        } catch (error) {
          console.error("Error handling group message:", error);
        }
      });

      socket.on("groupMediaMessage", (message) => {
        try {
          console.log("Received groupMediaMessage event:", JSON.stringify(message).substring(0, 200));
          handleNewMessage(message);
        } catch (error) {
          console.error("Error handling media message:", error);
        }
      });
      
      // Thêm lắng nghe event "message" chung - định dạng phổ biến từ web
      socket.on("message", (message) => {
        try {
          console.log("Received generic message event:", JSON.stringify(message).substring(0, 200));
          
          // Kiểm tra nếu tin nhắn dành cho nhóm này
          const msgRoomId = message.roomId || message.room;
          const msgGroupId = message.groupId || (msgRoomId && typeof msgRoomId === 'string' && msgRoomId.replace('group:', ''));
          
          if (msgGroupId === groupId || msgRoomId === `group:${groupId}` || msgRoomId === groupId) {
            console.log("Message is for this group, processing...");
            handleNewMessage(message);
          }
        } catch (error) {
          console.error("Error handling generic message:", error);
        }
      });
      
      // Thêm event "newMessage" - một định dạng khác có thể được sử dụng
      socket.on("newMessage", (message) => {
        try {
          console.log("Received newMessage event:", JSON.stringify(message).substring(0, 200));
          
          // Kiểm tra nếu tin nhắn dành cho nhóm này
          const msgRoomId = message.roomId || message.room;
          const msgGroupId = message.groupId || (msgRoomId && typeof msgRoomId === 'string' && msgRoomId.replace('group:', ''));
          
          if (msgGroupId === groupId || msgRoomId === `group:${groupId}` || msgRoomId === groupId) {
            console.log("Message is for this group, processing...");
            handleNewMessage(message);
          }
        } catch (error) {
          console.error("Error handling newMessage event:", error);
        }
      });

      socket.on("messageDeleted", (data) => {
        try {
          handleMessageDeleted(data);
        } catch (error) {
          console.error("Error handling message deletion:", error);
        }
      });
      
      socket.on("groupMessageDeleted", (data) => {
        try {
          handleMessageDeleted(data);
        } catch (error) {
          console.error("Error handling group message deletion:", error);
        }
      });

      socket.on("messageReaction", (data) => {
        try {
          handleMessageReaction(data);
        } catch (error) {
          console.error("Error handling message reaction:", error);
        }
      });
      
      socket.on("groupMessageReaction", (data) => {
        try {
          handleMessageReaction(data);
        } catch (error) {
          console.error("Error handling group message reaction:", error);
        }
      });

      socket.on("userTyping", (data) => {
        try {
          if (data.groupId === groupId && data.userId !== user._id) {
            setTypingUsers((prev) => ({
              ...prev,
              [data.userId]: data.userName,
            }));
          
            // Auto remove typing indicator after 3 seconds
            setTimeout(() => {
              setTypingUsers((prev) => {
                const updated = { ...prev };
                delete updated[data.userId];
                return updated;
              });
            }, 3000);
          }
        } catch (error) {
          console.error("Error handling user typing:", error);
        }
      });

      socket.on("userStoppedTyping", (data) => {
        try {
          if (data.groupId === groupId) {
            setTypingUsers((prev) => {
              const updated = { ...prev };
              delete updated[data.userId];
              return updated;
            });
          }
        } catch (error) {
          console.error("Error handling user stopped typing:", error);
        }
      });
      
      // Add new event to confirm room connection was successful
      socket.on("roomConnectionVerified", (data) => {
        if (data.roomId === standardRoomId || data.roomId === groupId) {
          console.log("Room connection verified:", data.roomId);
        }
      });
      
      // Add event for message sync completion
      socket.on("messageSyncComplete", (data) => {
        if (data.groupId === groupId) {
          console.log("Message sync complete for group:", groupId);
          // Optionally refresh messages here if needed
          loadMessages();
        }
      });
      
      // Add new event for remote updates
      socket.on("remoteUpdate", (data) => {
        if (data.type === "groupUpdate" && data.groupId === groupId) {
          console.log("Remote group update received, refreshing data");
          loadMessages();
          loadGroupInfo();
        }
      });
      
      // Enhanced reconnection handling
      socket.on("connect", () => {
        console.log("Socket reconnected, rejoining rooms");
        
        // Rejoin all rooms after reconnection
        socket.emit("joinRoom", { roomId: standardRoomId });
        socket.emit("joinRoom", { roomId: groupId });
        socket.emit("joinGroupRoom", { groupId: groupId });
        socket.emit("join", standardRoomId);
        socket.emit("join", groupId);
        
        // Request sync of any missed messages during disconnection
        socket.emit("syncMessages", { 
          groupId: groupId, 
          lastMessageId: messages.length > 0 ? messages[messages.length - 1]._id : null 
        });
        
        // Notify others that this user is back online
        socket.emit("userOnline", { userId: user._id, groups: [groupId] });
        
        // Tải lại tin nhắn sau khi kết nối lại
        loadMessages();
      });
      
      // Handle explicit disconnection
      socket.on("disconnect", () => {
        console.log("Socket disconnected from group chat");
        
        // Try to reconnect after a short delay
        setTimeout(() => {
          if (isMounted && (!socketRef.current || !socketRef.current.connected)) {
            console.log("Attempting to reconnect socket...");
            setupSocket();
          }
        }, 3000);
      });
      
      // Add listener for incoming messages
      socket.on("incomingWebMessage", (data) => {
        try {
          console.log("Received direct notification about web message:", JSON.stringify(data).substring(0, 200));
          if (data.groupId === groupId) {
            // Load latest messages or try to get the specific message
            if (data.messageId) {
              // Try to get the specific message
              socketRef.current.emit("getSpecificMessage", {
                messageId: data.messageId,
                groupId: groupId
              });
            } else {
              // Or just reload messages
              loadMessages();
            }
          }
        } catch (error) {
          console.error("Error handling incoming web message notification:", error);
        }
      });

      socket.on("specificMessage", (message) => {
        try {
          console.log("Received specific message:", JSON.stringify(message).substring(0, 200));
          if (message && message.groupId === groupId) {
            handleNewMessage(message);
          }
        } catch (error) {
          console.error("Error handling specific message:", error);
        }
      });
      
      // Thêm các listener mới sau socket.on("newMessage", ...)

      // Thêm các sự kiện khác mà web có thể đang sử dụng
      socket.on("chatMessage", (message) => {
        try {
          console.log("Received chatMessage event:", JSON.stringify(message).substring(0, 200));
          if (message.groupId === groupId || message.roomId === `group:${groupId}` || 
              message.room === `group:${groupId}` || message.to === groupId) {
            handleNewMessage(message);
          }
        } catch (error) {
          console.error("Error handling chatMessage event:", error);
        }
      });

      socket.on("groupChatMessage", (message) => {
        try {
          console.log("Received groupChatMessage event:", JSON.stringify(message).substring(0, 200));
          if (message.groupId === groupId || message.roomId === `group:${groupId}` || 
              message.room === `group:${groupId}` || message.to === groupId) {
            handleNewMessage(message);
          }
        } catch (error) {
          console.error("Error handling groupChatMessage event:", error);
        }
      });

      // Lắng nghe sự kiện messageCreated (được sử dụng trong một số triển khai Socket.IO)
      socket.on("messageCreated", (message) => {
        try {
          console.log("Received messageCreated event:", JSON.stringify(message).substring(0, 200));
          if (message.groupId === groupId || message.roomId === `group:${groupId}` || 
              message.room === `group:${groupId}` || message.to === groupId) {
            handleNewMessage(message);
          }
        } catch (error) {
          console.error("Error handling messageCreated event:", error);
        }
      });

      // Lắng nghe sự kiện 'notification' có thể chứa thông báo về tin nhắn mới
      socket.on("notification", (data) => {
        try {
          console.log("Received notification event:", JSON.stringify(data).substring(0, 200));
          if (data.type === 'new_message' && 
              (data.groupId === groupId || data.roomId === `group:${groupId}`)) {
            // Tải lại tin nhắn nếu nhận được thông báo về tin nhắn mới
            loadMessages();
          }
        } catch (error) {
          console.error("Error handling notification event:", error);
        }
      });

      // Thêm event listener cho các sự kiện cập nhật
      socket.on("messageUpdate", (data) => {
        try {
          console.log("Received messageUpdate event:", JSON.stringify(data).substring(0, 200));
          if (data.groupId === groupId) {
            loadMessages(); // Tải lại tin nhắn khi có cập nhật
          }
        } catch (error) {
          console.error("Error handling messageUpdate event:", error);
        }
      });

      // Lắng nghe sự kiện yêu cầu làm mới từ web
      socket.on("refreshRequest", (data) => {
        try {
          console.log("Received refreshRequest:", JSON.stringify(data).substring(0, 200));
          if (data.groupId === groupId || data.roomId === `group:${groupId}`) {
            loadMessages();
          }
        } catch (error) {
          console.error("Error handling refresh request:", error);
        }
      });
      
    } catch (error) {
      console.error("Socket setup error:", error);
      
      // Try to reconnect after error
      setTimeout(() => {
        if (isMounted) {
          console.log("Attempting to reconnect after socket setup error...");
          setupSocket();
        }
      }, 5000);
    }
  };

  const cleanupSocket = () => {
    if (socketRef.current) {
      socketRef.current.off("groupMessage");
      socketRef.current.off("messageDeleted");
      socketRef.current.off("messageReaction");
      socketRef.current.off("userTyping");
      socketRef.current.off("userStoppedTyping");
      if (socketRef.current.connected) {
        socketRef.current.emit("leaveRoom", { roomId: `group:${groupId}` });
      }
    }
  };

  // Cải thiện loadMessages để ghi nhớ thời gian đồng bộ
  const loadMessages = async () => {
    try {
      console.log("Loading messages for group:", groupId);
      setLoading(true);
      setInitialLoad(true);

      // Cập nhật thời gian đồng bộ
      setLastSyncTime(Date.now());

      // Try to get cached messages first for immediate display
      try {
        const cachedMessagesJson = await AsyncStorage.getItem(`cached_group_messages_${groupId}`);
        if (cachedMessagesJson) {
          const cachedMessages = JSON.parse(cachedMessagesJson);
          if (cachedMessages && cachedMessages.length > 0) {
            // Show cached messages immediately while full load happens in background
            setImmediateMessages(cachedMessages);
            // Pre-scroll to bottom with cached messages
            setTimeout(() => scrollToBottomWithDelay(50), 50);
          }
        }
      } catch (cacheError) {
        console.log("Error loading cached messages:", cacheError);
      }

      // Get token from storage
      const token = await AsyncStorage.getItem("token");

      if (!token) {
        console.error("No auth token available for loading group messages");
        Alert.alert("Error", "Authentication required. Please log in again.");
        return;
      }

      // Notify web clients that mobile is syncing
      if (socketRef.current && socketRef.current.connected) {
        console.log("Notifying web clients that mobile is syncing messages");
        socketRef.current.emit("mobileSyncRequest", {
          groupId: groupId,
          userId: user._id,
          timestamp: new Date().toISOString()
        });
      }

      let messagesData = [];
      let response;

      // Try primary group messages endpoint
      try {
        console.log(`Fetching group messages for group ${groupId}`);
        response = await axios.get(
          `${API_URL}/api/groups/${groupId}/messages?limit=50`, // Add limit parameter
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.data) {
          if (Array.isArray(response.data)) {
            messagesData = response.data;
            console.log(
              `Loaded ${messagesData.length} group messages directly from response array`
            );
          } else if (
            response.data.messages &&
            Array.isArray(response.data.messages)
          ) {
            messagesData = response.data.messages;
            console.log(
              `Loaded ${messagesData.length} group messages from response.data.messages`
            );
          } else {
            console.log(
              "Unexpected response format for group messages:",
              response.data
            );
            messagesData = [];
          }
        } else {
          console.log("No data returned for group messages");
          messagesData = [];
        }
      } catch (err) {
        console.log("Group messages endpoint failed:", err.message || err);
        console.log(`Trying alternate endpoint for group ${groupId}...`);

        // Try alternate endpoint as fallback
        try {
          response = await axios.get(
            `${API_URL}/api/chat/groups/${groupId}/messages?limit=50`, // Add limit parameter
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (response.data) {
            messagesData = Array.isArray(response.data)
              ? response.data
              : response.data.messages
              ? response.data.messages
              : [];

            console.log(
              `Loaded ${messagesData.length} group messages from alternate endpoint`
            );
          }
        } catch (altErr) {
          console.log(
            "Alternate group messages endpoint also failed:",
            altErr.message || altErr
          );

          // One more attempt with a different API structure
          try {
            response = await axios.get(
              `${API_URL}/api/chat/room/group:${groupId}/messages?limit=50`, // Add limit parameter
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            if (response.data) {
              messagesData = Array.isArray(response.data)
                ? response.data
                : response.data.messages
                ? response.data.messages
                : [];

              console.log(
                `Loaded ${messagesData.length} group messages from room-prefixed endpoint`
              );
            }
          } catch (finalErr) {
            console.log("All endpoints failed. Using empty message list.");
          }
        }
      }

      // Process and format the messages
      if (messagesData && messagesData.length > 0) {
        const formattedMessages = messagesData.map((msg) => {
          // Normalize sender format
          let sender = msg.sender || {};
          if (typeof sender === "string") {
            // Look up user in members if possible
            const memberInfo = members.find((m) => m._id === sender);
            sender = {
              _id: sender,
              name: memberInfo?.name || sender,
              avt: memberInfo?.avt || "",
            };
          }

          return {
            _id: msg._id || msg.id || `temp-${Date.now()}-${Math.random()}`,
            content: msg.content || "",
            type: msg.type || "text",
            sender: {
              _id: sender._id || sender.id || "",
              name:
                sender.name ||
                `${sender.firstName || ""} ${sender.lastName || ""}`.trim() ||
                "Unknown",
              avt: sender.avt || sender.avatar || "",
            },
            createdAt: msg.createdAt || new Date().toISOString(),
            reactions: msg.reactions || {},
            isUnsent: msg.isUnsent || msg.unsent || false,
            fileUrl: msg.fileUrl || msg.file?.url || "",
            fileName: msg.fileName || msg.file?.name || "",
            fileSize: msg.fileSize || msg.file?.size || 0,
            groupId: groupId,
            roomId: `group:${groupId}`,
            replyTo: msg.replyTo,
            senderId: msg.senderId || user._id,
            senderName: msg.senderName || user.name,
            senderAvatar: msg.senderAvatar || user.avt,
            file: msg.file,
            id: msg.id,
            text: msg.text,
            messageType: msg.messageType,
            userId: msg.userId,
            userName: msg.userName,
            userAvatar: msg.userAvatar,
            timestamp: msg.timestamp,
            time: msg.time,
            url: msg.url,
            name: msg.name,
            size: msg.size,
            room: msg.room,
            reply_to: msg.reply_to,
            from: msg.from,
            from_name: msg.from_name,
            avatar: msg.avatar,
            chatType: msg.chatType,
            status: msg.status,
            read: msg.read,
            delivered: msg.delivered,
            to: msg.to,
            recipients: msg.recipients,
            files: msg.files,
            message: msg.message,
            data: msg.data,
            messageId: msg.messageId,
            attachments: msg.attachments,
            date: msg.date,
            datetime: msg.datetime,
            chat: msg.chat,
            seen: msg.seen,
            body: msg.body,
          };
        });

        // Sort by createdAt, oldest first for proper chat display
        formattedMessages.sort((a, b) => {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        // Set messages immediately and then scroll to bottom
        setMessages(formattedMessages);
        setLoading(false); // Move this here to show messages faster
        setInitialLoad(false);
        
        // After setting messages, immediately try to scroll to bottom
        setTimeout(() => {
          scrollToBottomWithDelay(50); 
        }, 50);

        // Filter out locally deleted messages
        filterLocallyDeletedMessages().catch(err =>
          console.error("Error filtering deleted messages:", err)
        );

        // Cache these messages for next time
        try {
          await AsyncStorage.setItem(
            `cached_group_messages_${groupId}`, 
            JSON.stringify(formattedMessages)
          );
        } catch (cacheError) {
          console.log("Error caching messages:", cacheError);
        }
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
      Alert.alert(
        "Error",
        "Failed to load messages. Please try again.",
        [{ text: "Retry", onPress: loadMessages }]
      );
    } finally {
      // Note: We moved setLoading(false) to immediately after setting messages
      // to improve perceived performance
      
      // Only scroll if we haven't scrolled already
      if (messages.length > 0 && loading) {
        scrollToBottomWithDelay(50);
      }
    }
  };

  // Thêm useEffect cho việc tự động đồng bộ định kỳ
  useEffect(() => {
    if (!groupId) return;
    
    // Định kỳ kiểm tra tin nhắn mới
    const autoSyncInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        // Chỉ đồng bộ nếu đã đủ thời gian từ lần đồng bộ cuối
        const timeSinceLastSync = Date.now() - lastSyncTime;
        if (timeSinceLastSync >= AUTO_SYNC_INTERVAL) {
          console.log(`Auto-syncing messages after ${Math.round(timeSinceLastSync/1000)}s`);
          
          // Gửi yêu cầu kiểm tra tin nhắn mới
          socketRef.current.emit("checkNewMessages", {
            groupId: groupId,
            userId: user._id,
            lastSync: new Date(lastSyncTime).toISOString()
          });
          
          // Gửi ping tới web clients để thông báo mobile đang hoạt động
          socketRef.current.emit("mobilePing", {
            groupId: groupId,
            userId: user._id,
            timestamp: new Date().toISOString()
          });
        }
      }
    }, 2000); // Kiểm tra mỗi 2 giây
    
    return () => {
      clearInterval(autoSyncInterval);
    };
  }, [groupId, lastSyncTime]);

  const handleNewMessage = (message: Message) => {
    console.log(`Group message received:`, JSON.stringify(message).substring(0, 200));

      // Nếu tin nhắn không có nội dung, kiểm tra tất cả các định dạng có thể
  const messageContent = message.content || message.text || message.message || 
                        (message.data && message.data.content) || message.body || '';
  if (!messageContent) {
    console.log("Message has no content in any format, skipping");
    return;
  }
  
  // Cập nhật nội dung tin nhắn cho xử lý
  if (!message.content) {
    message.content = messageContent;
  }

    // Enhanced room/group ID validation
    const messageGroupId = message.groupId || 
                         (message.roomId && message.roomId.replace('group:', '')) ||
                         (message.room && message.room.replace('group:', ''));
    
    // Kiểm tra có phải tin nhắn cho nhóm này không
    if (!messageGroupId || (messageGroupId !== groupId)) {
      console.log(`Ignoring message for different group: ${messageGroupId}`);
      return;
    }

      // Enhanced duplicate detection - kiểm tra tất cả các định dạng ID có thể
  const messageId = message._id || message.id || message.messageId;
  const tempId = message.tempId;

  // Nếu không có ID, tạo một ID dựa trên nội dung và thời gian
  if (!messageId && !tempId) {
    console.log("Message has no ID, generating one from content and timestamp");
    const timestamp = message.createdAt || message.timestamp || message.time || 
                     message.date || message.datetime || new Date().toISOString();
    const contentHash = messageContent.substring(0, 20);
    const senderId = message.senderId || (message.sender && message.sender._id) || 
                     message.userId || message.from || "unknown";
    
    // Tạo ID tạm thời từ thời gian, nội dung và người gửi
    message._id = `gen_${Date.now()}_${senderId}_${contentHash}`;
    console.log("Generated message ID:", message._id);
  }

    if (messageId && socketService.isMessageReceived(messageId)) {
      console.log(`Ignoring duplicate message with ID: ${messageId}`);
      return;
    }

    if (tempId && socketService.isMessageReceived(tempId)) {
      console.log(`Ignoring duplicate message with tempId: ${tempId}`);
      return;
    }

    // Mark as received to avoid duplicates
    if (messageId) socketService.markMessageReceived(messageId);
    if (tempId) socketService.markMessageReceived(tempId);

    if (isMounted) {
      // More robust duplicate check
      const isDuplicate = messages.some(
        (m) =>
          (messageId && m._id === messageId) ||
          (message.id && m._id === message.id) ||
          (message.tempId && m.tempId === message.tempId) ||
          (m.content === (message.content || message.text) && 
           m.sender._id === (message.sender?._id || message.senderId || message.userId) && 
           Math.abs(new Date(m.createdAt).getTime() - new Date(message.createdAt || message.timestamp || message.time || Date.now()).getTime()) < 5000) // Tăng phạm vi so sánh thời gian
      );

      if (isDuplicate) {
        console.log("Duplicate message detected and skipped");
        return;
      }

      // More standardized message format with better handling of different formats
      const processedMessage = {
        _id: messageId || tempId || `temp-${Date.now()}-${Math.random()}`,
        content: message.content || message.text || "",
        type: message.type || message.messageType || "text",
        sender: message.sender || {
          _id: message.senderId || message.userId || message.from || user._id,
          name: message.senderName || message.userName || message.from_name || user.name,
          avt: message.senderAvatar || message.userAvatar || message.avatar || user.avt,
        },
        createdAt: message.createdAt || message.timestamp || message.time || new Date().toISOString(),
        reactions: message.reactions || {},
        isUnsent: message.isUnsent || message.unsent || false,
        fileUrl: message.fileUrl || (message.file && message.file.url) || message.url || "",
        fileName: message.fileName || (message.file && message.file.name) || message.name || "",
        fileSize: message.fileSize || (message.file && message.file.size) || message.size || 0,
        groupId: groupId,
        roomId: `group:${groupId}`,
        replyTo: message.replyTo || message.reply_to,
        senderId: message.senderId || (message.sender && message.sender._id) || message.userId,
        senderName: message.senderName || (message.sender && message.sender.name) || message.userName,
        senderAvatar: message.senderAvatar || (message.sender && message.sender.avt) || message.userAvatar,
        file: message.file,
        id: message.id,
        text: message.text,
        messageType: message.messageType,
        userId: message.userId,
        userName: message.userName,
        userAvatar: message.userAvatar,
        timestamp: message.timestamp,
        time: message.time,
        url: message.url,
        name: message.name,
        size: message.size,
        room: message.room,
        reply_to: message.reply_to,
        from: message.from,
        from_name: message.from_name,
        avatar: message.avatar,
        chatType: message.chatType,
        status: message.status,
        read: message.read,
        delivered: message.delivered,
        to: message.to,
        recipients: message.recipients,
        files: message.files,
        message: message.message,
        data: message.data,
        messageId: message.messageId,
        attachments: message.attachments,
        date: message.date,
        datetime: message.datetime,
        chat: message.chat,
        seen: message.seen,
        body: message.body,
      };

      // Add message to state with better sorting
      setMessages((prevMessages) => {
        // Create a new array with the new message
        const updatedMessages = [...prevMessages, processedMessage];
        
        // Ensure proper chronological ordering
        updatedMessages.sort((a, b) => {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        
        // Cập nhật thời gian đồng bộ cuối
        setLastSyncTime(Date.now());
        
        // Send acknowledgment that message was received and processed
        if (socketRef.current && socketRef.current.connected) {
          // Gửi nhiều định dạng xác nhận nhận tin nhắn
          const ackData = {
            messageId: processedMessage._id,
            groupId: groupId,
            receiverId: user._id,
            userId: user._id
          };
          
          socketRef.current.emit("messageReceived", ackData);
          socketRef.current.emit("messageAcknowledged", ackData);
          socketRef.current.emit("readReceipt", {
            ...ackData,
            status: "received"
          });
          
          // Thông báo web rằng mobile đã nhận tin nhắn
          socketRef.current.emit("mobileReceivedMessage", {
            messageId: processedMessage._id,
            groupId: groupId,
            userId: user._id,
            timestamp: new Date().toISOString()
          });
        }
        
        return updatedMessages;
      });

      // Scroll handling with better conditions
      if (shouldScrollToBottom || 
          (message.sender && message.sender._id === user._id) || 
          (message.senderId === user._id) ||
          (messages.length === 0)) {
        scrollToBottomWithDelay(100);
      } else if (!showScrollButton) {
        setShowScrollButton(true);
      }
      
          // Cache updated messages to avoid reload issues
    try {
      AsyncStorage.setItem(
        `cached_group_messages_${groupId}`, 
        JSON.stringify([...messages, processedMessage])
      );
    } catch (cacheError) {
      console.log("Error caching new message:", cacheError);
    }
    
    // Hiển thị thông báo Toast cho người dùng
    if (
      message.senderId !== user._id && 
      message.sender?._id !== user._id && 
      message.userId !== user._id
    ) {
      // In ra console thay cho Toast (vì ta không có Toast component)
      console.log(`Tin nhắn mới từ ${processedMessage.sender.name}: ${processedMessage.content.substring(0, 30)}${processedMessage.content.length > 30 ? '...' : ''}`);
    }
    
    // Force UI update
    setTimeout(() => {
      // Buộc React Native re-render component
      setMessages((current) => [...current]);
    }, 100);
    }
  };

  // Add handler for scroll events to detect if user is near bottom
  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 40; // Increased padding to better detect bottom area
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= 
      contentSize.height - paddingToBottom;
    
    setShouldScrollToBottom(isCloseToBottom);
    setShowScrollButton(!isCloseToBottom);
  }, []);

  // Add function to scroll to bottom
  const scrollToBottom = () => {
    scrollToBottomWithDelay(100);
  };

  const handleMessageDeleted = (data: { messageId: string, deleteType?: string }) => {
    if (isMounted) {
      // For "delete for everyone" (unsent)
      if (!data.deleteType || data.deleteType === "everyone") {
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg._id === data.messageId
              ? {
                  ...msg,
                  isUnsent: true,
                  content: "This message has been deleted",
                }
              : msg
          )
        );
      } 
      // For "delete for me" - remove the message from current user's view
      else if (data.deleteType === "for-me") {
        setMessages((prevMessages) => 
          prevMessages.filter((msg) => msg._id !== data.messageId)
        );
      }
    }
  };

  const handleMessageReaction = (data: {
    messageId: string;
    userId: string;
    emoji: string;
  }) => {
    if (isMounted) {
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
  };

  const handleTyping = (text: string) => {
    setInputMessage(text);

    // Send typing status to group
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("typing", {
        userId: user._id,
        userName: user.name,
        groupId: groupId,
        isGroup: true,
      });

      // Clear any existing timeout
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }

      // Set new timeout to stop typing after 2 seconds
      const timeout = setTimeout(() => {
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("stopTyping", {
            userId: user._id,
            groupId: groupId,
            isGroup: true,
          });
        }
      }, 2000);

      setTypingTimeout(timeout);
    }
  };

  const sendMessage = async (
    content: string,
    type: string,
    fileUrl?: string,
    fileName?: string,
    fileSize?: number
  ) => {
    if (!content.trim()) return;

    try {
      setSending(true);

      // Create a temporary ID for the message
      const tempId = uuid.v4() as string;

      // Create temporary message to show immediately
      const tempMessage: Message = {
        _id: tempId,
        content: content.trim(),
        sender: {
          _id: user._id,
          name: user.name,
          avt: user.avt,
        },
        groupId: groupId,
        createdAt: new Date().toISOString(),
        tempId: tempId,
        type: type,
        fileUrl: fileUrl,
        fileName: fileName,
        fileSize: fileSize,
        ...(replyTo ? {
          replyTo: {
            _id: replyTo._id,
            content: replyTo.content,
            sender: replyTo.sender,
          }
        } : {})
      };

      // Add to local messages for immediate feedback
      if (isMounted) {
        setMessages((prev) => [...prev, tempMessage]);
        setInputMessage("");
        setReplyTo(null); // Clear reply after sending
        
        // Update cache immediately to show message even if send fails
        try {
          const cachedMessagesJson = await AsyncStorage.getItem(`cached_group_messages_${groupId}`);
          let cachedMessages = cachedMessagesJson ? JSON.parse(cachedMessagesJson) : [];
          cachedMessages = [...cachedMessages, tempMessage];
          await AsyncStorage.setItem(`cached_group_messages_${groupId}`, JSON.stringify(cachedMessages));
        } catch (cacheError) {
          console.log("Error updating cache:", cacheError);
        }
      }

      console.log(`Sending group message: ${tempMessage.content} to group ${groupId} with tempId ${tempId}`);

      // Make sure we scroll to bottom when sending messages
      setTimeout(() => {
        scrollToBottomWithDelay(100);
        setShouldScrollToBottom(true);
        setShowScrollButton(false);
      }, 100);

      // Ensure socket is connected and reconnect if needed
      if (!socketRef.current || !socketRef.current.connected) {
        console.log("Socket not connected, reconnecting...");
        try {
          const socket = await socketService.initSocket(true); // Use aggressive reconnection
          if (socket) {
            socketRef.current = socket;
            // Rejoin the group room with standardized format
            socket.emit("joinRoom", { roomId: `group:${groupId}` });
            socket.emit("joinGroupRoom", { groupId });
            console.log(`Rejoined group rooms`);
          }
        } catch (error) {
          console.error("Failed to reconnect socket:", error);
        }
      }

      // Try socket first with better error handling and retry
      let socketSuccess = false;
      let retries = 0;
      const maxRetries = 2;
      
      while (!socketSuccess && retries < maxRetries) {
        if (socketRef.current && socketRef.current.connected) {
          try {
            const messageData = {
              roomId: `group:${groupId}`,
              groupId: groupId,
              content: tempMessage.content,
              sender: {
                _id: user._id,
                name: user.name,
                avt: user.avt,
              },
              senderId: user._id,
              senderName: user.name,
              senderAvatar: user.avt,
              type: type,
              tempId: tempId,
              fileUrl: fileUrl,
              fileName: fileName,
              fileSize: fileSize,
              createdAt: tempMessage.createdAt,
              timestamp: tempMessage.createdAt, // Thêm timestamp cho web client
              ...(replyTo ? { replyToId: replyTo._id } : {})
            };

            socketSuccess = await groupChatService.emitGroupMessage(messageData);
            console.log(`Socket send attempt ${retries + 1}: ${socketSuccess ? "success" : "failed"}`);
            
            if (socketSuccess) {
              // Thêm vào danh sách tin nhắn đã gửi để tránh trùng lặp
              setLocalSentMessages(prev => new Set([...prev, tempId]));
              
              // Emit event to web clients to ensure they receive the message
              socketRef.current.emit("notifyNewMessage", {
                roomId: `group:${groupId}`,
                groupId: groupId,
                messageId: tempId,
                sender: user._id
              });
              
              // Thêm thông báo trực tiếp cho web clients
              socketRef.current.emit("mobileMessageSent", {
                message: {
                  ...messageData,
                  room: `group:${groupId}`, // Thêm room cho web client
                  _id: tempId,
                  id: tempId // Thêm id cho web client
                },
                platform: "mobile"
              });
              
              // Gửi sự kiện với các định dạng khác nhau mà web có thể lắng nghe
              socketRef.current.emit("message", {
                ...messageData,
                room: `group:${groupId}`,
                _id: tempId,
                id: tempId
              });
              
              break;
            }
          } catch (socketError) {
            console.error(`Socket send error (attempt ${retries + 1}):`, socketError);
          }
        }
        
        retries++;
        if (!socketSuccess && retries < maxRetries) {
          // Wait briefly before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log(`Retrying socket send, attempt ${retries + 1}...`);
        }
      }

      // If socket failed or not connected after retries, fall back to API
      if (!socketSuccess) {
        console.log("Falling back to API for group message");
        try {
          const token = await AsyncStorage.getItem("token");
          if (!token) {
            throw new Error("No auth token available");
          }

          const apiResponse = await axios.post(
            `${API_URL}/api/groups/message`,
            {
              groupId: groupId,
              content: tempMessage.content,
              type: type,
              tempId: tempId,
              sender: {
                _id: user._id,
                name: user.name,
                avt: user.avt,
              },
              fileUrl: fileUrl,
              fileName: fileName,
              fileSize: fileSize,
              ...(replyTo ? { replyToId: replyTo._id } : {}),
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          console.log(
            "Group message API response:",
            apiResponse.status,
            apiResponse.data && apiResponse.data._id
          );

          if (apiResponse.data && apiResponse.data._id) {
                  // Update the temporary message with the real ID
      const realMsgId = apiResponse.data._id;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.tempId === tempId
            ? { ...msg, _id: realMsgId }
            : msg
        )
      );
      
      // Add to local sent messages to prevent duplication
      setLocalSentMessages(prev => new Set([...prev, realMsgId]));
            
            // Notify others about the new message via socket even though we used API to send
            if (socketRef.current && socketRef.current.connected) {
              // Thông báo với nhiều định dạng để đảm bảo tương thích
              const notificationData = {
                roomId: `group:${groupId}`,
                groupId: groupId,
                messageId: apiResponse.data._id,
                sender: user._id,
                content: tempMessage.content,
                type: type,
                createdAt: tempMessage.createdAt
              };
              
              socketRef.current.emit("notifyNewMessage", notificationData);
              
              // Gửi thông báo trực tiếp cho web clients
              socketRef.current.emit("mobileMessageSent", {
                message: {
                  ...notificationData,
                  _id: apiResponse.data._id,
                  id: apiResponse.data._id,
                  sender: {
                    _id: user._id,
                    name: user.name,
                    avt: user.avt
                  },
                  senderId: user._id,
                  senderName: user.name,
                  senderAvatar: user.avt,
                  room: `group:${groupId}`,
                  fileUrl: fileUrl,
                  fileName: fileName,
                  fileSize: fileSize
                },
                platform: "mobile"
              });
              
              // Broadcast message using format web clients may be listening for
              socketRef.current.emit("message", {
                _id: apiResponse.data._id,
                id: apiResponse.data._id,
                room: `group:${groupId}`,
                roomId: `group:${groupId}`,
                groupId: groupId,
                content: tempMessage.content,
                text: tempMessage.content,
                type: type,
                messageType: type,
                sender: {
                  _id: user._id,
                  name: user.name,
                  avt: user.avt
                },
                senderId: user._id,
                senderName: user.name,
                senderAvatar: user.avt,
                createdAt: tempMessage.createdAt,
                timestamp: tempMessage.createdAt,
                fileUrl: fileUrl,
                fileName: fileName,
                fileSize: fileSize
              });
            }
          }
        } catch (apiError) {
          console.error("API send failed:", apiError);
          // Mark message as failed in UI
          setMessages((prev) =>
            prev.map((msg) =>
              msg.tempId === tempId ? { ...msg, failed: true } : msg
            )
          );

          Alert.alert(
            "Lỗi gửi tin nhắn",
            "Không thể gửi tin nhắn. Bạn có muốn thử lại?",
            [
              {
                text: "Thử lại",
                onPress: () => {
                  // Remove failed message and try again
                  setMessages((prev) =>
                    prev.filter((msg) => msg.tempId !== tempId)
                  );
                  setInputMessage(tempMessage.content);
                },

              },
              {
                text: "Hủy",
                style: "cancel",
              },
            ]
          );
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      if (isMounted) {
        setSending(false);
      }
    }
  };

  const navigateToGroupDetails = () => {
    navigation.navigate("GroupDetails", { 
      groupId,
      groupName,
      groupAvatar: groupAvatarUrl
    });
  };

  const handleImagePress = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setIsImageViewVisible(true);
  };

  const handleVideoPress = (videoUrl: string) => {
    setSelectedVideo(videoUrl);
    setIsVideoVisible(true);
  };

  const handleImagePicker = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert("Yêu cầu quyền", "Cần quyền truy cập thư viện ảnh");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        const fileName = uri.split("/").pop() || "image.jpg";

        setIsUploading(true);
        setUploadProgress(0);

        try {
          const cloudinaryResponse = await cloudinaryService.uploadImage(
            uri,
            "chat_image",
            (progress) => {
              setUploadProgress(progress);
            }
          );

          if (cloudinaryResponse && cloudinaryResponse.secure_url) {
            sendMessage(
              "Hình ảnh",
              "image",
              cloudinaryResponse.secure_url,
              fileName,
              cloudinaryResponse.bytes || 0
            );
          }
        } catch (error) {
          console.error("Lỗi upload:", error);
          Alert.alert("Lỗi", "Không thể tải lên ảnh. Vui lòng thử lại.");
        }
      }
    } catch (error) {
      console.error("Lỗi chọn ảnh:", error);
      Alert.alert("Lỗi", "Không thể chọn ảnh. Vui lòng thử lại.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleVideoPicker = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert("Yêu cầu quyền", "Cần quyền truy cập thư viện media");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 0.7,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
        const fileSize = fileInfo.exists ? fileInfo.size || 0 : 0;
        const fileName = uri.split("/").pop() || "video.mp4";

        if (fileSize > 20 * 1024 * 1024) {
          Alert.alert(
            "Video lớn",
            `Video có kích thước ${Math.round(
              fileSize / 1024 / 1024
            )}MB. Việc tải lên có thể mất nhiều thời gian. Tiếp tục?`,
            [
              { text: "Hủy", style: "cancel" },
              {
                text: "Tải lên",
                onPress: () => uploadVideoFile(uri, fileName, fileSize),
              },
            ]
          );
        } else {
          uploadVideoFile(uri, fileName, fileSize);
        }
      }
    } catch (error) {
      console.error("Lỗi chọn video:", error);
      Alert.alert("Lỗi", "Không thể chọn video. Vui lòng thử lại.");
    }
  };

  const uploadVideoFile = async (
    uri: string,
    fileName: string,
    fileSize: number
  ) => {
    const tempId = `temp-${Date.now()}`;

    try {
      setIsUploading(true);
      setUploadProgress(0);

      const token = await AsyncStorage.getItem("token");
      if (!token) {
        throw new Error("Không tìm thấy token xác thực");
      }

      const result = await cloudinaryService.uploadFile(
        uri,
        {
          name: fileName,
          type: "video",
          size: fileSize,
        },
        token,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      if (result && result.fileUrl) {
        await sendMessage(
          "Video message",
          "video",
          result.fileUrl,
          result.fileName || fileName,
          result.fileSize || fileSize
        );
      }
    } catch (error) {
      console.error("Lỗi tải lên video:", error);
      Alert.alert("Lỗi", "Không thể tải lên video. Vui lòng thử lại.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync();

      if (result.canceled) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = asset.name;
      const fileSize = asset.size || 0;
      const mimeType = asset.mimeType || "application/octet-stream";

      setIsUploading(true);
      setUploadProgress(0);

      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert("Lỗi", "Không tìm thấy token xác thực");
        return;
      }

      try {
        const cloudinaryResponse = await cloudinaryService.uploadFile(
          uri,
          {
            name: fileName,
            type: "file",
            size: fileSize,
          },
          token,
          (progress) => {
            setUploadProgress(progress);
          }
        );

        if (cloudinaryResponse && cloudinaryResponse.fileUrl) {
          await sendMessage(
            "Tài liệu",
            "file",
            cloudinaryResponse.fileUrl,
            fileName,
            fileSize
          );
        }
      } catch (error) {
        console.error("Lỗi upload:", error);
        Alert.alert("Lỗi", "Không thể tải lên tài liệu. Vui lòng thử lại.");
      }
    } catch (error) {
      console.error("Lỗi chọn tài liệu:", error);
      Alert.alert("Lỗi", "Không thể chọn tài liệu. Vui lòng thử lại.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const startRecording = async () => {
    try {
      if (recording) return;

      const { granted } = await Audio.getPermissionsAsync();
      if (!granted) {
        const { granted: newGranted } = await Audio.requestPermissionsAsync();
        if (!newGranted) {
          Alert.alert(
            "Cần quyền",
            "Ứng dụng cần quyền truy cập microphone để ghi âm"
          );
          return;
        }
      }

      if (recordingRef.current !== null) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (err) {
          console.log("Error during cleanup:", err);
        } finally {
          recordingRef.current = null;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync({
        android: {
          extension: ".m4a",
          outputFormat: 2,
          audioEncoder: 3,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: "aac",
          audioQuality: 0.8,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 128000,
        },
      });

      recordingRef.current = newRecording;
      setRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      Alert.alert("Lỗi", "Không thể bắt đầu ghi âm. Vui lòng thử lại.");
      recordingRef.current = null;
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      setRecording(false);

      if (!recordingRef.current) return;

      const status = await recordingRef.current.getStatusAsync();
      if (!status.isRecording) {
        recordingRef.current = null;
        return;
      }

      await recordingRef.current.stopAndUnloadAsync();

      let uri = recordingRef.current.getURI() || "";
      const tempRecordingRef = recordingRef.current;
      recordingRef.current = null;

      if (!uri) {
        throw new Error("Không có URI ghi âm");
      }

      await uploadAudioRecording(uri);

      try {
        await tempRecordingRef._cleanupForUnloadedRecorder();
      } catch (cleanupError) {
        console.log("Cleanup warning:", cleanupError);
      }
    } catch (error) {
      console.error("Failed to process audio recording:", error);
      Alert.alert("Lỗi", "Không thể xử lý ghi âm. Vui lòng thử lại.");
      recordingRef.current = null;
      setRecording(false);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const uploadAudioRecording = async (uri: string) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      const fileName = `audio_${Date.now()}.m4a`;
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        throw new Error("Không tìm thấy token xác thực");
      }

      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      const fileSize = fileInfo.exists ? (fileInfo as any).size || 0 : 0;

      const result = await cloudinaryService.uploadFile(
        uri,
        {
          name: fileName,
          type: "audio",
          size: fileSize,
        },
        token,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      if (result && result.fileUrl) {
        await sendMessage(
          "Tin nhắn thoại",
          "audio",
          result.fileUrl,
          fileName,
          fileSize
        );
      }
    } catch (error) {
      console.error("Audio upload error:", error);
      Alert.alert("Lỗi", "Không thể tải lên tin nhắn thoại. Vui lòng thử lại.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Hiển thị thanh tiến độ tải lên
  const renderUploadProgress = () => {
    if (!isUploading) return null;

    return (
      <View style={styles.uploadProgressContainer}>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
        </View>
        <Text
          style={styles.progressText}
        >{`Đang tải lên: ${uploadProgress}%`}</Text>
      </View>
    );
  };

  const renderAttachmentMenu = () => {
    return (
      <Modal
        transparent={true}
        visible={showAttachMenu}
        animationType="slide"
        onRequestClose={() => setShowAttachMenu(false)}
      >
        <TouchableOpacity
          style={styles.attachmentOverlay}
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
        >
          <View style={styles.attachmentContainer}>
            <Text style={styles.attachmentTitle}>Đính kèm file</Text>

            <View style={styles.attachmentOptions}>
              <TouchableOpacity
                style={styles.attachmentOption}
                onPress={() => {
                  handleImagePicker();
                  setShowAttachMenu(false);
                }}
              >
                <View
                  style={[
                    styles.attachmentIcon,
                    { backgroundColor: "#4caf50" },
                  ]}
                >
                  <Ionicons name="image" size={24} color="#fff" />
                </View>
                <Text style={styles.attachmentText}>Hình ảnh</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachmentOption}
                onPress={() => {
                  handleVideoPicker();
                  setShowAttachMenu(false);
                }}
              >
                <View
                  style={[
                    styles.attachmentIcon,
                    { backgroundColor: "#f44336" },
                  ]}
                >
                  <Ionicons name="videocam" size={24} color="#fff" />
                </View>
                <Text style={styles.attachmentText}>Video</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachmentOption}
                onPress={() => {
                  startRecording();
                  setShowAttachMenu(false);
                }}
              >
                <View
                  style={[
                    styles.attachmentIcon,
                    { backgroundColor: "#2196F3" },
                  ]}
                >
                  <Ionicons name="mic" size={24} color="#fff" />
                </View>
                <Text style={styles.attachmentText}>Âm thanh</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachmentOption}
                onPress={() => {
                  handleDocumentPicker();
                  setShowAttachMenu(false);
                }}
              >
                <View
                  style={[
                    styles.attachmentIcon,
                    { backgroundColor: "#ff9800" },
                  ]}
                >
                  <Ionicons name="document" size={24} color="#fff" />
                </View>
                <Text style={styles.attachmentText}>Tài liệu</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.closeAttachButton}
              onPress={() => setShowAttachMenu(false)}
            >
              <Text style={styles.closeAttachText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Handler for message reactions
  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      if (!socketRef.current || !socketRef.current.connected) {
        console.log("Socket not connected, can't send reaction");
        return;
      }

      socketRef.current.emit("addGroupReaction", {
        messageId,
        userId: user._id,
        emoji,
        groupId,
      });

      // Update UI immediately
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg._id === messageId
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
      
      // Hide reaction picker
      setShowReactions(null);
    } catch (error) {
      console.error("Error sending reaction:", error);
    }
  };

  // Handler for deleting messages
  const handleDeleteMessage = async (messageId: string, deleteType: "everyone" | "for-me") => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        throw new Error("No auth token available");
      }

      console.log(`Starting delete operation: ${deleteType} for message ${messageId}`);
      
      // Show loading indicator
      setSending(true);
      
      if (deleteType === "everyone") {
        // Delete for everyone (this part works fine)
        const response = await axios.delete(`${API_URL}/api/groups/message/${messageId}`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { deleteType: "everyone" },
        });
        
        console.log("Delete for everyone response:", response.status);

        // Socket emissions
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("deleteGroupMessage", {
            messageId,
            userId: user._id,
            groupId,
            deleteType: "everyone",
          });
        }

        // Update UI for "delete for everyone"
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === messageId
              ? {
                  ...msg,
                  isUnsent: true,
                  content: "This message has been deleted",
                }
              : msg
          )
        );

        Alert.alert("Thành công", "Đã thu hồi tin nhắn cho mọi người");
      } else {
        // CLIENT-SIDE DELETE FOR ME IMPLEMENTATION
        console.log("Using client-side implementation for delete-for-me");
        
        try {
          // 1. Store this deleted message ID in AsyncStorage
          const storageKey = `deleted_messages_${user._id}`;
          const existingDataStr = await AsyncStorage.getItem(storageKey);
          let deletedMessages = existingDataStr ? JSON.parse(existingDataStr) : {};
          
          // Group deleted messages by group ID
          if (!deletedMessages[groupId]) {
            deletedMessages[groupId] = [];
          }
          
          if (!deletedMessages[groupId].includes(messageId)) {
            deletedMessages[groupId].push(messageId);
          }
          
          // Save back to AsyncStorage
          await AsyncStorage.setItem(storageKey, JSON.stringify(deletedMessages));
          console.log("Saved deletion to local storage");
          
          // 2. Remove from current UI
          setMessages(prevMessages => prevMessages.filter(msg => msg._id !== messageId));
          
          // 3. Try to emit a socket event in case server supports this
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit("deleteMessageForMe", {
              messageId,
              userId: user._id,
              groupId
            });
          }
          
          Alert.alert("Thành công", "Đã xóa tin nhắn");
        } catch (localError) {
          console.error("Error in local delete implementation:", localError);
          Alert.alert("Lỗi", "Không thể xóa tin nhắn");
        }
      }
    } catch (error) {
      console.error("Error in delete operation:", error);
      Alert.alert("Lỗi", "Không thể thực hiện yêu cầu xóa tin nhắn");
    } finally {
      setSending(false);
    }
  };
  
  // Add function to filter out messages that were deleted locally
  const filterLocallyDeletedMessages = useCallback(async () => {
    try {
      const storageKey = `deleted_messages_${user._id}`;
      const deletedDataStr = await AsyncStorage.getItem(storageKey);
      
      if (deletedDataStr) {
        const deletedMessages = JSON.parse(deletedDataStr);
        
        // Get list of deleted message IDs for this group
        const deletedIds = deletedMessages[groupId] || [];
        
        if (deletedIds.length > 0) {
          // Filter out any deleted messages
          setMessages(prevMessages => 
            prevMessages.filter(msg => !deletedIds.includes(msg._id))
          );
          console.log(`Filtered out ${deletedIds.length} locally deleted messages`);
        }
      }
    } catch (error) {
      console.error("Error filtering locally deleted messages:", error);
    }
  }, [groupId, user._id]);
  
  // Call filter when messages are loaded or changed
  useEffect(() => {
    if (!loading && messages.length > 0) {
      filterLocallyDeletedMessages();
    }
  }, [loading, messages.length, filterLocallyDeletedMessages]);
  
  // Also call filter when component mounts
  useEffect(() => {
    filterLocallyDeletedMessages();
  }, [filterLocallyDeletedMessages]);

  // Let's also add a method to manually recover messages if needed
  // This helps with debugging by letting you restore messages that failed to delete
  const restoreMessage = (messageId: string) => {
    // Check if the message exists in current state
    const exists = messages.some(msg => msg._id === messageId);
    if (exists) {
      console.log(`Message ${messageId} already exists in state`);
      return;
    }

    // Try to fetch the specific message from server
    const fetchMessage = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        if (!token) return;
        
        // Try to get message from server if possible
        const response = await axios.get(
          `${API_URL}/api/groups/${groupId}/message/${messageId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.data) {
          setMessages(prev => [...prev, response.data]);
          console.log("Restored message from server");
        }
      } catch (error) {
        console.log("Could not fetch message from server");
        // No special handling needed, this is just a debug feature
      }
    };
    
    fetchMessage();
  };

  const confirmDeleteMessage = (messageId: string, isOwnMessage: boolean) => {
    // Options for the alert dialog
    const options = [];
    
    // If it's the user's own message, show both delete options
    if (isOwnMessage) {
      options.push({
        text: "Thu hồi với mọi người",
        onPress: () => handleDeleteMessage(messageId, "everyone"),
      });
    }
    
    // All users can delete messages for themselves
    options.push({
      text: "Xóa chỉ với tôi",
      onPress: () => handleDeleteMessage(messageId, "for-me"),
    });
    
    // Add cancel option
    options.push({
      text: "Hủy",
      style: "cancel",
    });
    
    // Show the alert
    Alert.alert("Xóa tin nhắn", "Bạn muốn xóa tin nhắn này như thế nào?", options);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isCurrentUser = item.sender._id === user._id;
    const messageTime = moment(item.createdAt).format("HH:mm");

    // Handle replies more consistently with ChatDetailScreen
    const renderReplyContent = () => {
      if (!item.replyTo) return null;
      
      return (
        <View style={styles.replyContainer}>
          <Text style={styles.replyText} numberOfLines={1}>
            {item.replyTo.content}
          </Text>
        </View>
      );
    };

    // Handle message content by type
    const renderMessageContent = () => {
      if (item.isUnsent) {
        return <Text style={[
          styles.messageText, 
          isCurrentUser ? styles.currentUserMessageText : {}
        ]}>Tin nhắn đã bị thu hồi</Text>;
      }

      switch (item.type) {
        case "text":
          return <Text style={[
            styles.messageText,
            isCurrentUser ? styles.currentUserMessageText : {}
          ]}>{item.content}</Text>;
        case "image":
          return (
            <TouchableOpacity onPress={() => handleImagePress(item.fileUrl || "")}>
              <Image
                source={{ uri: item.fileUrl || "" }}
                style={styles.messageImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          );
        case "video":
          return (
            <TouchableOpacity
              onPress={() => handleVideoPress(item.fileUrl || "")}
              style={styles.videoThumbnail}
            >
              <View style={styles.playButton}>
                <Ionicons name="play-circle" size={40} color="#fff" />
              </View>
            </TouchableOpacity>
          );
        case "audio":
          return (
            <View style={[
              styles.audioContainer,
              isCurrentUser ? { backgroundColor: "rgba(255,255,255,0.2)" } : { backgroundColor: "rgba(0,0,0,0.05)" }
            ]}>
              {!item.fileUrl ? (
                <View style={styles.audioErrorContainer}>
                  <Ionicons name="alert-circle" size={20} color="#ff6b6b" />
                  <Text style={[
                    styles.audioErrorText,
                    isCurrentUser ? { color: "rgba(255,255,255,0.8)" } : {}
                  ]}>Audio không khả dụng</Text>
                </View>
              ) : (
                <AudioPlayer audioUri={item.fileUrl} small={true} />
              )}
            </View>
          );
        case "file":
          return (
            <TouchableOpacity
              style={[
                styles.fileContainer,
                isCurrentUser ? { backgroundColor: "rgba(255,255,255,0.2)" } : { backgroundColor: "rgba(0,0,0,0.05)" }
              ]}
              onPress={() => Linking.openURL(item.fileUrl || "")}
            >
              <FontAwesome5 
                name="file-alt" 
                size={24} 
                color={isCurrentUser ? "#fff" : "#607D8B"} 
              />
              <View style={styles.fileInfoContainer}>
                <Text style={[
                  { fontSize: 14, marginLeft: 8 },
                  isCurrentUser ? { color: "#fff" } : { color: "#666" }
                ]} numberOfLines={1}>
                  {item.fileSize && (
                    item.fileSize < 1024 * 1024 
                    ? `${Math.round(item.fileSize / 1024)} KB` 
                    : `${Math.round((item.fileSize / 1024 / 1024) * 10) / 10} MB`
                  )}
                </Text>
              </View>
            </TouchableOpacity>
          );
        default:
          return <Text style={[
            styles.messageText,
            isCurrentUser ? styles.currentUserMessageText : {}
          ]}>{item.content}</Text>;
      }
    };

    // Handle reactions display
    const renderReactions = () => {
      if (!item.reactions || Object.keys(item.reactions).length === 0) return null;

      return (
        <View style={styles.reactionsContainer}>
          {Object.entries(item.reactions).map(([userId, emoji]) => (
            <Text key={userId} style={styles.reaction}>
              {typeof emoji === 'string' ? emoji : '👍'}
            </Text>
          ))}
        </View>
      );
    };

    return (
      <View
        style={[
          styles.messageContainer,
          isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage,
        ]}
      >
        {!isCurrentUser && (
          <Image
            source={{
              uri: item.sender.avt || "https://via.placeholder.com/40",
            }}
            style={styles.avatar}
          />
        )}

        <TouchableOpacity
          style={[
            styles.messageBubble,
            isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble,
            item.failed ? styles.failedMessage : {},
          ]}
          activeOpacity={0.8}
          onLongPress={() => {
            if (item.isUnsent) return; // Don't show options for unsent messages
              
            const options = [];
              
            // Options that appear first
            options.push({ 
              text: "Trả lời", 
              onPress: () => setReplyTo(item) 
            });
              
            options.push({ 
              text: "Thả cảm xúc", 
              onPress: () => setShowReactions(item._id)
            });
              
            // Download option for media messages
            if (
              item.type &&
              ["image", "video", "audio", "file"].includes(item.type) &&
              item.fileUrl
            ) {
              options.push({
                text: "Lưu về thiết bị",
                onPress: () => Linking.openURL(item.fileUrl || ""),
              });
            }
              
            // Nếu là admin hoặc co-admin, có thể xóa tin nhắn của bất kỳ ai
            // Nếu là người dùng thường, chỉ có thể xóa tin nhắn của chính mình
            if (isCurrentUser || userRole === "admin" || userRole === "co-admin") {
              options.push({
                text: "Xóa tin nhắn",
                onPress: () => confirmDeleteMessage(item._id, isCurrentUser),
                style: "destructive"
              });
            }
              
            options.push({ text: "Hủy", style: "cancel" });
              
            Alert.alert("Tùy chọn tin nhắn", "", options);
          }}
        >
          {!isCurrentUser && (
            <Text style={styles.messageSender}>{item.sender.name}</Text>
          )}

          {renderReplyContent()}
          {renderMessageContent()}
          {renderReactions()}

          <Text style={[
            styles.messageTime,
            isCurrentUser ? styles.currentUserMessageTime : {}
          ]}>
            {messageTime}
            {item.failed && " ⚠️"}
          </Text>
        </TouchableOpacity>

        {isCurrentUser && (
          <TouchableOpacity
            style={styles.messageOptions}
            onPress={() => {
              const options = [];
                
              // Options that appear first
              options.push({ 
                text: "Trả lời", 
                onPress: () => setReplyTo(item) 
              });
                
              options.push({ 
                text: "Thả cảm xúc", 
                onPress: () => setShowReactions(item._id)
              });
              
              options.push({ text: "Hủy", style: "cancel" });
                
              Alert.alert("Tùy chọn tin nhắn", "", options);
            }}
          >
            <Ionicons name="ellipsis-vertical" size={16} color="#999" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Thêm hàm xử lý khi người dùng nhấn vào tin nhắn audio
  const handleAudioPress = (message: Message) => {
    setSelectedAudio(message);
    setIsAudioPreviewVisible(true);
  };

  // Render emoji picker for reactions
  const renderEmojiPicker = () => {
    if (!showReactions) return null;
    
    const commonEmojis = ['❤️', '😀', '😂', '👍', '👎', '😢', '😠', '👏'];
    
    return (
      <Modal
        transparent={true}
        visible={!!showReactions}
        animationType="fade"
        onRequestClose={() => setShowReactions(null)}
      >
        <TouchableOpacity 
          style={styles.emojiPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowReactions(null)}
        >
          <View style={styles.emojiPicker}>
            {commonEmojis.map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiButton}
                onPress={() => handleReaction(showReactions, emoji)}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Render the reply bar when replying to a message
  const renderReplyBar = () => {
    if (!replyTo) return null;
    
    return (
      <View style={styles.replyBar}>
        <View style={styles.replyBarInfo}>
          <Text style={styles.replyingTo}>
            {replyTo.sender.name === user.name ? 'You' : replyTo.sender.name}
          </Text>
          <Text style={styles.replyContent} numberOfLines={1}>
            {replyTo.content}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.cancelReply} 
          onPress={() => setReplyTo(null)}
        >
          <Ionicons name="close" size={20} color="#666" />
        </TouchableOpacity>
      </View>
    );
  };

  // Add a function to render audio preview with enhanced design
  const renderAudioPreview = () => {
    if (!selectedAudio) return null;
    
    return (
      <Modal
        visible={isAudioPreviewVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsAudioPreviewVisible(false)}
      >
        <View style={styles.audioPreviewModal}>
          <TouchableOpacity
            style={styles.closeModalButton}
            onPress={() => setIsAudioPreviewVisible(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.audioPreviewContent}>
            <View style={styles.audioPreviewHeader}>
              <Ionicons name="musical-note" size={40} color="#2196F3" />
              <Text style={styles.audioPreviewTitle}>
                {selectedAudio.fileName || "Tin nhắn thoại"}
              </Text>
            </View>
            
            <AudioPlayer audioUri={selectedAudio.fileUrl || ""} autoPlay={true} />
            
            <View style={styles.audioInfo}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                <Image 
                  source={{uri: selectedAudio.sender.avt || "https://via.placeholder.com/40"}}
                  style={{width: 24, height: 24, borderRadius: 12, marginRight: 8}}
                />
                <Text style={styles.audioSender}>
                  Gửi bởi: {selectedAudio.sender.name}
                </Text>
              </View>
              <Text style={styles.audioTime}>
                {moment(selectedAudio.createdAt).format("HH:mm, DD/MM/YYYY")}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => {
                if (selectedAudio && selectedAudio.fileUrl) {
                  Linking.openURL(selectedAudio.fileUrl);
                }
              }}
            >
              <Ionicons name="download" size={24} color="#fff" />
              <Text style={styles.downloadText}>Tải xuống</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // Load group members
  useEffect(() => {
    const loadGroupMembers = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        if (!token) return;
        
        const response = await axios.get(
          `${API_URL}/api/groups/${groupId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        
        if (response.data && response.data.members) {
          setMembers(response.data.members);
        }
      } catch (error) {
        console.error("Error loading group members:", error);
      }
    };
    
    loadGroupMembers();
  }, [groupId]);

  // Add this helper function to scroll to the bottom
  const scrollToBottomWithDelay = (delay = 100) => {
    if (!flatListRef.current || messages.length === 0) return;
    
    // For immediate scroll on initial load
    if (initialLoad) {
      flatListRef.current.scrollToEnd({ animated: false });
      setShouldScrollToBottom(true);
      setShowScrollButton(false);
      return;
    }
    
    setTimeout(() => {
      if (flatListRef.current) {
        flatListRef.current.scrollToEnd({ animated: false });
        setShouldScrollToBottom(true);
        setShowScrollButton(false);
      }
    }, delay);
  };

  // Add a periodic sync function to ensure messages stay in sync
  useEffect(() => {
    let syncInterval: NodeJS.Timeout | null = null;
    
    if (groupId && !loading) {
      // Set up periodic sync every 30 seconds
      syncInterval = setInterval(() => {
        if (socketRef.current && socketRef.current.connected) {
          console.log("Performing periodic message sync");
          socketRef.current.emit("syncMessages", { 
            groupId: groupId, 
            lastMessageId: messages.length > 0 ? messages[messages.length - 1]._id : null 
          });
        }
      }, 30000);
    }
    
    return () => {
      if (syncInterval) {
        clearInterval(syncInterval);
      }
    };
  }, [groupId, loading, messages.length]);

  // Add useEffect to check for new messages periodically
  useEffect(() => {
    // Function to request latest messages
    const checkForNewMessages = () => {
      if (socketRef.current && socketRef.current.connected) {
        console.log("Requesting latest messages check");
        socketRef.current.emit("checkLatestMessages", {
          groupId: groupId,
          lastMessageTime: messages.length > 0 
            ? new Date(messages[messages.length - 1].createdAt).getTime() 
            : 0
        });
      }
    };

    // Set up periodic checks
    let messageCheckInterval: NodeJS.Timeout | null = null;
    
    if (groupId && !loading) {
      // Initial check
      checkForNewMessages();
      
      // Set interval for periodic checks (every 15 seconds)
      messageCheckInterval = setInterval(checkForNewMessages, 15000);
    }
    
    // Clean up interval
    return () => {
      if (messageCheckInterval) {
        clearInterval(messageCheckInterval);
      }
    };
  }, [groupId, messages, loading]);

  // Thêm hàm forceRefreshMessages để làm mới tin nhắn thủ công
  const forceRefreshMessages = async () => {
    try {
      console.log("Forcing message refresh");
      setIsRefreshing(true);
      
      // Tải tin nhắn mới từ server
      await loadMessages();
      
      // Cập nhật thời gian làm mới cuối
      setLastSyncTime(Date.now());
      setLastWebMessageTime(Date.now());
      
      // Nếu socket đang kết nối, gửi yêu cầu đồng bộ
      if (socketRef.current && socketRef.current.connected) {
        // Thông báo cho server và clients khác
        socketRef.current.emit("mobileRefreshRequest", {
          groupId: groupId,
          userId: user._id,
          timestamp: new Date().toISOString()
        });
        
        // Yêu cầu kiểm tra tin nhắn mới
        socketRef.current.emit("checkLatestMessages", {
          groupId: groupId,
          lastMessageTime: messages.length > 0 
            ? new Date(messages[messages.length - 1].createdAt).getTime() 
            : 0
        });
      }
    } catch (error) {
      console.error("Error during force refresh:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Thêm useEffect cho việc định kỳ làm mới tin nhắn
  useEffect(() => {
    if (!groupId) return;
    
    // Thiết lập polling cho tin nhắn mới
    const pollInterval = setInterval(() => {
      // Đảm bảo không refresh quá thường xuyên
      const timeSinceLastRefresh = Date.now() - lastWebMessageTime;
      if (timeSinceLastRefresh >= FORCE_REFRESH_INTERVAL) {
        console.log(`Polling for new messages after ${Math.round(timeSinceLastRefresh/1000)}s`);
        
        // Thực hiện HTTP call thay vì dựa vào socket
        forceAPIRefresh();
        
        // Cập nhật thời gian
        setLastWebMessageTime(Date.now());
      }
    }, 2000); // Giảm xuống 2 giây
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [groupId, lastWebMessageTime, messages]);

  // Thêm hàm forceAPIRefresh để gọi API thay vì socket
  const forceAPIRefresh = async () => {
    try {
      // Get token from storage
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        console.error("No auth token available");
        return;
      }
      
      // Lấy tin nhắn mới nhất từ server bằng API call
      const response = await axios.get(
        `${API_URL}/api/groups/${groupId}/messages?limit=20`, 
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      // Xử lý dữ liệu nhận được
      if (response.data) {
        let newMessages: Message[] = [];
        
        if (Array.isArray(response.data)) {
          newMessages = response.data;
        } else if (response.data.messages && Array.isArray(response.data.messages)) {
          newMessages = response.data.messages;
        }
        
        if (newMessages.length > 0) {
          // Kiểm tra xem có tin nhắn mới không
          const latestServerMsgTime = new Date(newMessages[newMessages.length - 1].createdAt).getTime();
          const latestLocalMsgTime = messages.length > 0 
            ? new Date(messages[messages.length - 1].createdAt).getTime() 
            : 0;
          
          if (latestServerMsgTime > latestLocalMsgTime) {
            console.log("Found new messages via API, updating...");
            
            // Xử lý và thêm các tin nhắn mới
            const processedMessages = newMessages.map(msg => {
              return {
                _id: msg._id || msg.id || `temp-${Date.now()}-${Math.random()}`,
                content: msg.content || msg.text || "",
                type: msg.type || msg.messageType || "text",
                sender: msg.sender || {
                  _id: msg.senderId || user._id,
                  name: msg.senderName || user.name,
                  avt: msg.senderAvatar || user.avt,
                },
                createdAt: msg.createdAt || new Date().toISOString(),
                reactions: msg.reactions || {},
                isUnsent: msg.isUnsent || msg.unsent || false,
                fileUrl: msg.fileUrl || (msg.file && msg.file.url) || "",
                fileName: msg.fileName || (msg.file && msg.file.name) || "",
                fileSize: msg.fileSize || (msg.file && msg.file.size) || 0,
                groupId: groupId,
                roomId: `group:${groupId}`,
                replyTo: msg.replyTo,
                // Thêm các trường khác nếu cần...
              };
            });
            
            // Cập nhật danh sách tin nhắn
            setMessages(currentMessages => {
              // Kết hợp và loại bỏ trùng lặp
              const combinedMessages = [...currentMessages];
              
              processedMessages.forEach(newMsg => {
                // Kiểm tra xem tin nhắn đã tồn tại chưa dựa trên ID
                const existingIndex = combinedMessages.findIndex(m => m._id === newMsg._id);
                
                // Cũng kiểm tra các tin nhắn vừa gửi từ thiết bị hiện tại để tránh trùng lặp
                const isLocalSent = localSentMessages.has(newMsg._id);
                
                // Kiểm tra trùng lặp nội dung và thời gian gần nhau
                const isDuplicateContent = combinedMessages.some(m => 
                  m.content === newMsg.content && 
                  m.sender._id === newMsg.sender._id && 
                  Math.abs(new Date(m.createdAt).getTime() - new Date(newMsg.createdAt).getTime()) < 2000
                );
                
                // Chỉ thêm nếu không phải tin nhắn trùng lặp
                if (existingIndex === -1 && !isLocalSent && !isDuplicateContent) {
                  // Nếu là tin nhắn từ người dùng khác (không phải tin nhắn của mình)
                  if (newMsg.sender._id !== user._id) {
                    combinedMessages.push(newMsg);
                  }
                }
              });
              
              // Sắp xếp theo thời gian
              combinedMessages.sort((a, b) => 
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              );
              
              return combinedMessages;
            });
            
            // Scroll to bottom if needed
            if (shouldScrollToBottom) {
              scrollToBottomWithDelay(100);
            }
          }
        }
      }
    } catch (error) {
      console.error("API refresh error:", error);
    }
  };

  // Thêm phần UI nút làm mới ở UI
  const renderRefreshButton = () => {
    return (
      <TouchableOpacity 
        style={styles.refreshButton} 
        onPress={forceRefreshMessages}
        disabled={isRefreshing}
      >
        <Ionicons 
          name={isRefreshing ? "sync-circle" : "refresh-circle"} 
          size={28} 
          color="#0084ff" 
          style={isRefreshing ? { transform: [{ rotate: '45deg' }] } : {}}
        />
        {isRefreshing && (
          <ActivityIndicator 
            style={styles.refreshIndicator} 
            size="small" 
            color="#0084ff" 
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{flex: 1}}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Sử dụng component header mới */}
        <GroupChatHeader 
          navigation={navigation}
          groupId={groupId}
          groupName={groupName}
          groupAvatarUrl={groupAvatarUrl}
          userRole={userRole}
          members={members}
          typingUsers={typingUsers}
          navigateToGroupDetails={navigateToGroupDetails}
          returnScreen={returnScreen}
        />

        <View style={{flex: 1}}>
          {loading && (
            <View style={styles.loadingIndicatorTop}>
              <ActivityIndicator size="small" color="#0084ff" />
            </View>
          )}
          
          <FlatList
            ref={flatListRef}
            data={messages.length > 0 ? messages : immediateMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id || item.tempId}
            contentContainerStyle={[
              styles.messagesList,
              // Add padding at the bottom when loading to ensure space for the loading indicator
              loading ? { paddingTop: 40 } : {}
            ]}
            onLayout={() => {
              if (messages.length > 0) {
                scrollToBottomWithDelay(50);
              }
            }}
            onScroll={handleScroll}
            onContentSizeChange={() => {
              if (shouldScrollToBottom || initialLoad) {
                scrollToBottomWithDelay(50);
              }
            }}
            scrollEventThrottle={400}
            inverted={false}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No messages yet</Text>
                  <Text style={styles.emptySubtext}>
                    Be the first to send a message!
                  </Text>
                </View>
              ) : null
            }
          />
          
          {/* Typing indicator */}
          {Object.values(typingUsers).length > 0 && (
            <View style={styles.typingContainer}>
              <View style={styles.typingBubble}>
                <Text style={styles.typingText}>
                  {Object.values(typingUsers).length > 1
                    ? `${Object.values(typingUsers).length} people are typing...`
                    : `${Object.values(typingUsers)[0]} is typing...`}
                </Text>
                <View style={styles.typingAnimation}>
                  <View style={[styles.typingDot, styles.typingDot1]} />
                  <View style={[styles.typingDot, styles.typingDot2]} />
                  <View style={[styles.typingDot, styles.typingDot3]} />
                </View>
              </View>
            </View>
          )}

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <TouchableOpacity 
              style={styles.scrollButton} 
              onPress={scrollToBottom}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-down" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {renderUploadProgress()}
        
        {/* Render emoji picker modal */}
        {renderEmojiPicker()}

        {/* Render reply bar if replying to a message */}
        {renderReplyBar()}

        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={() => setShowAttachMenu(true)}
          >
            <Ionicons name="attach" size={24} color="#0084ff" />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={replyTo ? "Reply to message..." : "Type a message..."}
            value={inputMessage}
            onChangeText={handleTyping}
            multiline
          />

          {inputMessage.trim() ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={() => sendMessage(inputMessage.trim(), "text")}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.recordButton}
              onPressIn={startRecording}
              onPressOut={stopRecording}
            >
              <Ionicons
                name={recording ? "radio-button-on" : "mic-outline"}
                size={24}
                color={recording ? "#ff0000" : "#0084ff"}
              />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {renderAttachmentMenu()}

      {/* Image viewer */}
      <ImageView
        images={selectedImage ? [{ uri: selectedImage }] : []}
        imageIndex={0}
        visible={isImageViewVisible}
        onRequestClose={() => setIsImageViewVisible(false)}
      />
      
      {/* Video player modal */}
      {isVideoVisible && selectedVideo && (
        <Modal
          visible={isVideoVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsVideoVisible(false)}
        >
          <View style={styles.videoModal}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsVideoVisible(false)}
            >
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            <Video
              source={{ uri: selectedVideo }}
              style={styles.fullScreenVideo}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={true}
            />
          </View>
        </Modal>
      )}
      
      {/* Audio preview modal */}
      {renderAudioPreview()}

      {/* Render refresh button */}
      {renderRefreshButton()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 10,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backButton: {
    padding: 5,
  },
  groupInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupTextContainer: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  onlineStatus: {
    fontSize: 12,
    color: "#4caf50",
  },
  infoButton: {
    paddingHorizontal: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messagesList: {
    paddingTop: 10,
    paddingBottom: Platform.OS === "android" ? 5 : 10,
  },
  messageContainer: {
    flexDirection: "row",
    marginBottom: 8, // Reduced space between messages
    alignItems: "flex-end",
    paddingHorizontal: 12,
  },
  currentUserMessage: {
    justifyContent: "flex-end",
    marginLeft: 50, // Push own messages more to the right
  },
  otherUserMessage: {
    justifyContent: "flex-start",
    marginRight: 50, // Push others' messages more to the left
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  messageBubble: {
    borderRadius: 18,
    padding: 12,
    maxWidth: "80%",
    minWidth: 50,
    elevation: 1, // Add subtle shadow for Android
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  currentUserBubble: {
    backgroundColor: "#0084ff", // Blue for sender
    borderBottomRightRadius: 4, // Pointed edge
  },
  otherUserBubble: {
    backgroundColor: "#f0f0f0", // Light gray for receiver
    borderBottomLeftRadius: 4, // Pointed edge
  },
  messageSender: {
    fontSize: 12,
    color: "#555",
    marginBottom: 4,
    fontWeight: "500",
  },
  messageText: {
    fontSize: 16,
    color: "#333", // Will override for current user
  },
  currentUserMessageText: {
    color: "#fff", // White text for current user's messages
  },
  messageTime: {
    fontSize: 10,
    color: "#999",
    alignSelf: "flex-end",
    marginTop: 4,
  },
  currentUserMessageTime: {
    color: "rgba(255,255,255,0.7)", // Semi-transparent white
  },
  deletedMessage: {
    fontStyle: "italic",
    color: "#999",
  },
  failedMessage: {
    borderColor: "#ff6b6b",
    backgroundColor: "#ffeeee",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 10,
    paddingBottom: Platform.OS === "android" ? 5 : 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  attachButton: {
    padding: 5,
    marginRight: 5,
  },
  input: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: "#2196F3",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  recordButton: {
    padding: 5,
    marginLeft: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#888",
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#888",
    marginTop: 8,
    textAlign: "center",
  },
  typingContainer: {
    padding: 8,
    backgroundColor: "transparent",
  },
  typingBubble: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '80%',
    alignSelf: 'flex-start',
    marginLeft: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  typingText: {
    fontSize: 14,
    color: "#666",
    marginRight: 10,
  },
  typingAnimation: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0084ff",
    marginHorizontal: 2,
  },
  typingDot1: {
    opacity: 0.4,
  },
  typingDot2: {
    opacity: 0.7,
  },
  typingDot3: {
    opacity: 1,
  },
  audioContainer: {
    padding: 5,
    borderRadius: 20,
    minWidth: 150,
  },
  audioText: {
    marginLeft: 10,
    color: "#0084ff",
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
  },
  fileText: {
    marginLeft: 10,
    color: "#0084ff",
    fontSize: 14,
  },
  attachmentOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  attachmentContainer: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  attachmentTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  attachmentOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  attachmentOption: {
    width: "48%",
    marginBottom: 15,
    alignItems: "center",
  },
  attachmentIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  attachmentText: {
    fontSize: 14,
    color: "#333",
  },
  closeAttachButton: {
    backgroundColor: "#f5f5f5",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  closeAttachText: {
    fontSize: 16,
    color: "#333",
  },
  uploadProgressContainer: {
    backgroundColor: "white",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  progressBarContainer: {
    height: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#2196F3",
  },
  progressText: {
    marginTop: 5,
    textAlign: "center",
    fontSize: 12,
    color: "#666",
  },
  audioMessageContainer: {
    backgroundColor: "#f0f0f0", 
    borderRadius: 12,
    padding: 8,
    marginBottom: 4,
    maxWidth: 250,
  },
  audioFileName: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    textAlign: "center",
  },
  audioPreviewModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
  },
  closeModalButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  audioPreviewContent: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    elevation: 5,
  },
  audioPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  audioPreviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  audioInfo: {
    width: '100%',
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
  },
  audioSender: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  audioTime: {
    fontSize: 12,
    color: '#666',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 20,
  },
  downloadText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '500',
  },
  emojiPickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  emojiPicker: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '80%',
    maxWidth: 300,
  },
  emojiButton: {
    padding: 10,
  },
  emoji: {
    fontSize: 24,
  },
  replyBar: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    alignItems: "center",
  },
  replyBarInfo: {
    flex: 1,
  },
  replyingTo: {
    fontSize: 12,
    color: "#2196F3",
    fontWeight: "bold",
  },
  replyContent: {
    fontSize: 14,
    color: "#666",
  },
  cancelReply: {
    padding: 5,
  },
  scrollButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0084ff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  videoThumbnail: {
    width: 200,
    height: 150,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: '#000',
    justifyContent: "center",
    alignItems: "center",
  },
  messageVideo: {
    width: "100%",
    height: "100%",
  },
  playButton: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  videoModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenVideo: {
    width: "100%",
    height: 300,
  },
  closeButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 15,
    padding: 5,
  },
  audioErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
    backgroundColor: '#ffeeee',
    borderRadius: 5,
    marginBottom: 5,
  },
  audioErrorText: {
    fontSize: 12,
    color: '#ff6b6b',
    marginLeft: 5,
  },
  fileInfoContainer: {
    flex: 1,
    marginLeft: 10,
  },
  fileName: {
    display: "none", // Hide the filename
  },
  fileSize: {
    fontSize: 12,
    color: '#999',
  },
  messageOptions: {
    padding: 5,
    marginLeft: 10,
  },
  reaction: {
    fontSize: 14,
    marginHorizontal: 2,
    color: '#666',
  },
  replyContainer: {
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#2196F3",
    backgroundColor: "rgba(33, 150, 243, 0.1)",
    borderRadius: 5,
    marginBottom: 5,
  },
  replyText: {
    fontSize: 12,
    color: "#555",
  },
  reactionsContainer: {
    flexDirection: "row",
    marginTop: 5,
    alignItems: "center",
  },
  loadingIndicatorTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.8)',
    zIndex: 10,
    alignItems: 'center',
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  defaultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0084ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  defaultAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  roleBadge: {
    fontSize: 12,
    color: '#0084ff',
    fontStyle: 'italic',
  },
  refreshButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.8)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  refreshIndicator: {
    position: 'absolute',
    width: 40,
    height: 40,
  },
});

export default GroupChatScreen;

