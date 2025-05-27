// Đảm bảo import Platform
import { Platform } from "react-native";
import { useState, useEffect } from "react";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// API URLs
// Các IP phổ biến:
// - 192.168.1.x: IP trong mạng LAN
// - 10.0.2.2: IP đặc biệt cho Android Emulator để kết nối đến localhost của máy
// - localhost: cho thiết bị iOS
// - 127.0.0.1: localhost

// Danh sách các IP phổ biến có thể thử kết nối (theo thứ tự ưu tiên)
export const POSSIBLE_IPS = ["https://italkconnect-v3.onrender.com"];

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

// Khởi tạo API URL với URL Render
export let API_URL = "https://italkconnect-v3.onrender.com";
console.log(`Khởi tạo API_URL: ${API_URL}`);

// Hàm để lấy API_URL hiện tại
export const getAPIURL = async () => API_URL;

// Hàm test connection (nếu cần)
export const testAndSetAPIConnection = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/health`, {
      timeout: 3000,
    });
    if (response.status === 200) {
      console.log(`API connection test successful to ${API_URL}/api/health`);
      return true;
    }
  } catch (error) {
    console.log(`API connection test failed for ${API_URL}:`, error.message);
    return false;
  }
  return true;
};

// Hàm tạo URL đầy đủ cho các endpoint API
export const getEndpointURL = async (endpoint: string): Promise<string> => {
  const baseUrl = await getAPIURL();
  // Đảm bảo không có dấu / trùng lặp
  if (endpoint.startsWith("/") && baseUrl.endsWith("/")) {
    return `${baseUrl}${endpoint.substring(1)}`;
  }
  if (!endpoint.startsWith("/") && !baseUrl.endsWith("/")) {
    return `${baseUrl}/${endpoint}`;
  }
  return `${baseUrl}${endpoint}`;
};

// Hàm tạo URL đầy đủ cho các endpoint đã định nghĩa
export const getAPIEndpoint = async (
  endpointKey: keyof typeof API_ENDPOINTS
): Promise<string> => {
  const baseUrl = await getAPIURL();
  const endpoint = API_ENDPOINTS[endpointKey];
  // Đảm bảo không có dấu / trùng lặp
  if (endpoint.startsWith("/") && baseUrl.endsWith("/")) {
    return `${baseUrl}${endpoint.substring(1)}`;
  }
  if (!endpoint.startsWith("/") && !baseUrl.endsWith("/")) {
    return `${baseUrl}/${endpoint}`;
  }
  return `${baseUrl}${endpoint}`;
};

// Hàm trả về fallback URL để tránh hardcoding
export const getFallbackURL = (endpoint?: string): string => {
  const baseUrl = API_URL;
  if (!endpoint) return baseUrl;
  if (endpoint.startsWith("/") && baseUrl.endsWith("/")) {
    return `${baseUrl}${endpoint.substring(1)}`;
  }
  if (!endpoint.startsWith("/") && !baseUrl.endsWith("/")) {
    return `${baseUrl}/${endpoint}`;
  }
  return `${baseUrl}${endpoint}`;
};

// Sử dụng Socket URL giống API URL nhưng đảm bảo đó là một chuỗi hợp lệ
export const getSocketURL = () => {
  // Đảm bảo trả về một chuỗi hợp lệ
  if (!API_URL || typeof API_URL !== "string" || !API_URL.startsWith("http")) {
    console.error("Invalid API_URL for socket:", API_URL);
    return `https://italkconnect-v3.onrender.com`;
  }
  return API_URL;
};

// App constants
export const APP_NAME = "iTalk+";
export const APP_VERSION = "1.0.0";

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: "auth_token",
  USER: "user",
  THEME: "app_theme",
  LANGUAGE: "app_language",
  API_IP: "api_ip",
};

// Default avatar
export const DEFAULT_AVATAR = "https://ui-avatars.com/api/?background=random";

// Cloudinary configuration
export const CLOUDINARY_CONFIG = {
  CLOUD_NAME: "dj5a0wx2n",
  API_KEY: "731712143896246",
  API_SECRET: "BPwn4ELB3UL0W4obHwW3Vjeoo1M",
  UPLOAD_PRESET: "italk_app_preset",
  FOLDER: "italk_app",
};
