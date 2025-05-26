import React from "react";
import * as FiIcons from "react-icons/fi";

// Định nghĩa kiểu dữ liệu cho các props của icon
interface IconProps {
  className?: string;
  size?: string | number;
  color?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

// Tạo các component wrapper cho các biểu tượng
export const FiMoreVertical: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiMoreVertical, props);
export const FiSearch: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiSearch, props);
export const FiArchive: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiArchive, props);
export const FiTrash2: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiTrash2, props);
export const FiX: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiX, props);
export const FiFileText: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiFileText, props);
export const FiPaperclip: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiPaperclip, props);
export const FiImage: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiImage, props);
export const FiVideo: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiVideo, props);
export const FiMusic: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiMusic, props);
export const FiSend: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiSend, props);
export const FiPlus: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiPlus, props);
export const FiUsers: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiUsers, props);
export const FiSettings: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiSettings, props);
export const FiUserPlus: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiUserPlus, props);
export const FiUserX: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiUserX, props);
export const FiUser: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiUser, props);
export const FiUserCheck: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiUserCheck, props);
export const FiAlertTriangle: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiAlertTriangle, props);
export const FiUpload: React.FC<IconProps> = (props) =>
  React.createElement(FiIcons.FiUpload, props);

// Thêm icon play video
export const FiPlay = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="feather feather-play"
    {...props}
  >
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);
