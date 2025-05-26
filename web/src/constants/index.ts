// Danh sách các IP có thể sử dụng
export const POSSIBLE_IPS = ["italkconnect-v3.onrender.com"];

// Cổng API mặc định
export const API_PORT = "3005";

// Định nghĩa các endpoint thường dùng
export const API_ENDPOINTS = {
  UPLOAD_CLOUDINARY: "/api/chat/upload-cloudinary",
  UPLOAD: "/api/chat/upload",
  HEALTH: "/api/health",
  CHAT: "/api/chat",
  AUTH: "/api/auth",
  USERS: "/api/user",
  GROUPS: "/api/groups",
  SEARCH: "/api/search",
  FRIENDSHIP: "/api/friendship",
};

// Hàm lấy IP từ localStorage nếu có
export const getStoredIP = () => {
  return localStorage.getItem("API_IP") || "italkconnect-v3.onrender.com";
};

// API endpoints
export const API_URL = `http://${getStoredIP()}:${API_PORT}`;
export const SOCKET_URL = API_URL; // Using same URL for socket connection
export const API_ENDPOINT = "https://italkconnect-v3.onrender.com/api";

// Tạo URL đầy đủ cho các endpoint
export const getFullApiUrl = (endpoint: string): string => {
  return `${API_ENDPOINT}${endpoint}`;
};

// Lấy URL đầy đủ cho các endpoint đã định nghĩa
export const getApiEndpoint = (
  endpointKey: keyof typeof API_ENDPOINTS
): string => {
  return API_ENDPOINTS[endpointKey];
};

// Hàm kiểm tra kết nối API và thay đổi IP nếu cần
export const testAndSetAPIConnection = async () => {
  try {
    const response = await fetch(API_ENDPOINT);
    if (response.ok) {
      return "https://italkconnect-v3.onrender.com";
    }
    throw new Error("API connection failed");
  } catch (error) {
    console.error("Error testing API connection:", error);
    return "https://italkconnect-v3.onrender.com";
  }
};

// Kiểm tra kết nối khi trang được tải
setTimeout(() => {
  testAndSetAPIConnection().then((apiUrl) => {
    console.log(`Using API URL: ${apiUrl}`);
  });
}, 1000);

// Auth related constants
export const TOKEN_KEY = "token";
export const USER_KEY = "user";

// Auth action types
export const AUTH_LOADING = "AUTH_LOADING";
export const LOGIN_SUCCESS = "LOGIN_SUCCESS";
export const REGISTER_SUCCESS = "REGISTER_SUCCESS";
export const AUTH_ERROR = "AUTH_ERROR";
export const LOGIN_ERROR = "LOGIN_ERROR";
export const LOGOUT = "LOGOUT";
export const GET_USER_SUCCESS = "GET_USER_SUCCESS";
export const UPDATE_USER_SUCCESS = "UPDATE_USER_SUCCESS";

// Toast notification types
export const TOAST_SUCCESS = "success";
export const TOAST_ERROR = "error";
export const TOAST_INFO = "info";
export const TOAST_WARNING = "warning";

// Socket connection config
export const SOCKET_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: Infinity, // Keep trying to reconnect forever
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000, // Tăng timeout để đảm bảo kết nối tốt hơn
  autoConnect: true,
  transports: ["websocket", "polling"],
  // Thay đổi forceNew thành true để bắt buộc tạo kết nối mới
  forceNew: true,
  // Add explicit path for socket to ensure consistent connection
  path: "/socket.io",
};
