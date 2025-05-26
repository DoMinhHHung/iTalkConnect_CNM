import { Message } from "./ChatInterfaceComponent";

// interface Message để hỗ trợ tính năng group chat
export interface GroupMessage extends Message {
  groupId?: string;
  chatType?: "private" | "group";
  isUnsent?: boolean;
  _isSending?: boolean;
}

// Định nghĩa vai trò thành viên trong nhóm
export type Role = "admin" | "coAdmin" | "member";

export interface GroupMember {
  _id: string;
  name: string;
  avt?: string;
  role: Role;
}

// Định nghĩa kiểu admin có thể là object hoặc string
export type AdminType = { _id: string; name?: string; avt?: string } | string;

// Định nghĩa kiểu nhóm
export interface Group {
  _id: string;
  name: string;
  description?: string;
  admin: AdminType;
  coAdmins: string[];
  members: GroupMember[];
  createdAt: string;
  avatarUrl?: string;
}

// Kiểu cho người gửi tin nhắn
export interface MessageSender {
  _id: string;
  name: string;
  avt?: string;
}
