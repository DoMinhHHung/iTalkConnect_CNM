import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';

// Định nghĩa các loại vai trò
export type UserRole = 'admin' | 'co-admin' | 'member';

// Interface cho thông tin nhóm
export interface GroupMember {
  _id: string;
  name: string;
  avt: string;
  email?: string;
}

export interface Group {
  _id: string;
  name: string;
  description?: string;
  members: GroupMember[];
  admin: GroupMember;
  coAdmins: GroupMember[];
  createdAt: string;
  avatar?: string;
}

/**
 * Xác định vai trò của người dùng từ dữ liệu nhóm
 * @param group Thông tin nhóm
 * @param userId ID của người dùng
 * @returns Vai trò của người dùng (admin, co-admin, member)
 */
export const determineUserRole = (group: any, userId: string): UserRole => {
  try {
    console.log("Determining user role from group data...");
    
    // Kiểm tra xem người dùng có phải là admin
    if (group.admin && typeof group.admin === 'object' && group.admin._id === userId) {
      console.log("User is group admin");
      return "admin";
    }
    
    // Kiểm tra xem người dùng có phải là co-admin
    if (group.coAdmins && Array.isArray(group.coAdmins)) {
      const isCoAdmin = group.coAdmins.some(
        (admin: any) => typeof admin === 'object' && admin._id === userId
      );
      
      if (isCoAdmin) {
        console.log("User is group co-admin");
        return "co-admin";
      }
    }
    
    // Nếu không phải admin hay co-admin, thì là thành viên thường
    console.log("User is regular member");
    return "member";
  } catch (error) {
    console.error("Error determining user role:", error);
    return "member"; // Mặc định là thành viên thường
  }
};

/**
 * Kiểm tra quyền hạn người dùng trong nhóm
 * @param groupId ID của nhóm
 * @param userId ID của người dùng
 * @returns Promise với vai trò của người dùng
 */
export const checkUserPermissions = async (groupId: string, userId: string): Promise<UserRole> => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return "member";

    // Thử sử dụng API endpoint check-permissions trước
    try {
      console.log("Trying check-permissions API endpoint...");
      const response = await axios.get(
        `${API_URL}/api/groups/${groupId}/check-permissions`, 
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      if (response.data) {
        if (response.data.isAdmin) {
          console.log("API confirmed user is admin");
          return "admin";
        } else if (response.data.isCoAdmin) {
          console.log("API confirmed user is co-admin");
          return "co-admin";
        } else {
          console.log("API confirmed user is regular member");
          return "member";
        }
      }
    } catch (permissionError: any) {
      console.log("Permission check API failed, falling back to group data method");
      
      // Nếu API check-permissions không hoạt động, lấy thông tin nhóm và xác định vai trò
      try {
        const groupResponse = await axios.get(
          `${API_URL}/api/groups/${groupId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        
        if (groupResponse.data) {
          return determineUserRole(groupResponse.data, userId);
        }
      } catch (groupError) {
        console.error("Failed to get group details:", groupError);
      }
    }
  } catch (error) {
    console.error("Error checking permissions:", error);
  }
  
  return "member"; // Mặc định là thành viên thường nếu có lỗi
};

/**
 * Lấy thông tin nhóm
 * @param groupId ID của nhóm
 * @returns Promise với thông tin nhóm
 */
export const getGroupInfo = async (groupId: string): Promise<Group | null> => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return null;

    const response = await axios.get(
      `${API_URL}/api/groups/${groupId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error("Failed to load group info:", error);
  }
  
  return null;
};

/**
 * Cập nhật thông tin nhóm
 * @param groupId ID của nhóm
 * @param updateData Dữ liệu cần cập nhật (name, description, avatar)
 * @returns Promise với kết quả cập nhật
 */
export const updateGroupInfo = async (
  groupId: string, 
  updateData: {name?: string; description?: string; avatar?: string}
): Promise<boolean> => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return false;
    
    await axios.put(
      `${API_URL}/api/groups/${groupId}`,
      updateData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return true;
  } catch (error) {
    console.error("Failed to update group:", error);
    return false;
  }
};

/**
 * Thêm thành viên vào nhóm
 * @param groupId ID của nhóm
 * @param memberId ID của thành viên cần thêm
 * @returns Promise với kết quả thêm thành viên
 */
export const addGroupMember = async (groupId: string, memberId: string): Promise<boolean> => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return false;
    
    await axios.post(
      `${API_URL}/api/groups/add-member`,
      {
        groupId,
        memberId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return true;
  } catch (error) {
    console.error("Failed to add member:", error);
    return false;
  }
};

/**
 * Xóa thành viên khỏi nhóm
 * @param groupId ID của nhóm
 * @param memberId ID của thành viên cần xóa
 * @returns Promise với kết quả xóa thành viên
 */
export const removeGroupMember = async (groupId: string, memberId: string): Promise<boolean> => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return false;
    
    await axios.post(
      `${API_URL}/api/groups/remove-member`,
      {
        groupId,
        memberId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return true;
  } catch (error) {
    console.error("Failed to remove member:", error);
    return false;
  }
};

/**
 * Thăng cấp thành viên lên co-admin
 * @param groupId ID của nhóm
 * @param userId ID của thành viên cần thăng cấp
 * @returns Promise với kết quả thăng cấp
 */
export const promoteToCoAdmin = async (groupId: string, userId: string): Promise<boolean> => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return false;
    
    await axios.post(
      `${API_URL}/api/groups/add-co-admin`,
      {
        groupId,
        userId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return true;
  } catch (error) {
    console.error("Failed to promote to co-admin:", error);
    return false;
  }
};

/**
 * Hạ cấp co-admin xuống thành viên thường
 * @param groupId ID của nhóm
 * @param userId ID của co-admin cần hạ cấp
 * @returns Promise với kết quả hạ cấp
 */
export const demoteFromCoAdmin = async (groupId: string, userId: string): Promise<boolean> => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return false;
    
    await axios.post(
      `${API_URL}/api/groups/remove-co-admin`,
      {
        groupId,
        userId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return true;
  } catch (error) {
    console.error("Failed to demote from co-admin:", error);
    return false;
  }
};

/**
 * Xóa nhóm
 * @param groupId ID của nhóm cần xóa
 * @returns Promise với kết quả xóa nhóm
 */
export const deleteGroup = async (groupId: string): Promise<boolean> => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return false;
    
    await axios.delete(
      `${API_URL}/api/groups/${groupId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    return true;
  } catch (error) {
    console.error("Failed to delete group:", error);
    return false;
  }
}; 