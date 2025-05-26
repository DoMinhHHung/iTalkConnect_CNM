const Group = require("../Models/groupModel");
const User = require("../Models/userModel");
const Message = require("../Models/messageModels");
const cloudinary = require("../config/cloudinaryConfig");

/**
 * Create a new group chat
 * Admin (creator): disband group, remove members, promote co-admins, add members
 * Co-admin: remove members, add members
 * Member: add members, leave group
 */
const createGroup = async (req, res) => {
  const { name, members, description } = req.body;
  const admin = req.user._id;
  let avatarUrl = null;

  try {
    // Upload group avatar if provided
    if (req.files && req.files.avatar) {
      const uploadResult = await cloudinary.uploader.upload(
        req.files.avatar.tempFilePath,
        {
          folder: "group_avatars",
          width: 150,
          crop: "scale",
        }
      );
      avatarUrl = uploadResult.secure_url;
    } else if (req.body.avatarUrl) {
      // If avatar was uploaded separately and URL is provided
      avatarUrl = req.body.avatarUrl;
    }

    // Ensure admin is included in members list
    if (!members.includes(admin.toString())) {
      members.push(admin);
    }
    
    // Validate minimum member count (should be at least 3 including admin)
    if (members.length < 3) {
      return res
        .status(400)
        .json({ message: "Nhóm phải có ít nhất 3 thành viên." });
    }

    // Create the group with admin as the creator
    const group = new Group({
      name,
      members,
      admin, // Group creator is admin
      description,
      avatarUrl,
      coAdmins: [], // Start with no co-admins
    });

    await group.save();

    // Return populated group data
    const populatedGroup = await Group.findById(group._id)
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    res
      .status(201)
      .json({ message: "Group created successfully", group: populatedGroup });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating group", error: error.message });
  }
};

/**
 * Add a new member to the group
 * Permission: Admin, Co-admin, Member
 */
const addMember = async (req, res) => {
  const { groupId, memberId } = req.body;
  const userId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if the user is a member of the group
    const isMember = group.members.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isMember) {
      return res
        .status(403)
        .json({ message: "You must be a member to add new members" });
    }

    // Add member to group
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $addToSet: { members: memberId } },
      { new: true }
    )
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    res
      .status(200)
      .json({ message: "Member added successfully", group: updatedGroup });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error adding member", error: error.message });
  }
};

/**
 * Remove a member from the group
 * Permission: Admin, Co-admin
 */
const removeMember = async (req, res) => {
  const { groupId, memberId } = req.body;
  const userId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user has permission to remove members
    const isAdmin = group.admin.toString() === userId.toString();
    const isCoAdmin = group.coAdmins.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isAdmin && !isCoAdmin) {
      return res
        .status(403)
        .json({ message: "You don't have permission to remove members" });
    }

    // Admin and co-admin can't be removed by co-admin
    if (isCoAdmin && !isAdmin) {
      if (
        group.admin.toString() === memberId.toString() ||
        group.coAdmins.some((id) => id.toString() === memberId.toString())
      ) {
        return res
          .status(403)
          .json({ message: "Co-admins can't remove admin or other co-admins" });
      }
    }

    // Remove member from group
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $pull: { members: memberId, coAdmins: memberId } },
      { new: true }
    )
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    res
      .status(200)
      .json({ message: "Member removed successfully", group: updatedGroup });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error removing member", error: error.message });
  }
};

/**
 * Get group details
 */
const getGroupDetails = async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await Group.findById(groupId)
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    res.status(200).json(group);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching group details", error: error.message });
  }
};

/**
 * Add a co-admin to the group
 * Permission: Admin only
 */
const addCoAdmin = async (req, res) => {
  const { groupId, userId } = req.body;
  const currentUserId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Không tìm thấy nhóm" });
    }

    // Only admin can add co-admins
    if (group.admin.toString() !== currentUserId.toString()) {
      return res
        .status(403)
        .json({ message: "Chỉ admin có thể thêm phó nhóm" });
    }

    // Check if the user is a member
    if (!group.members.some((id) => id.toString() === userId.toString())) {
      return res
        .status(400)
        .json({ message: "Người dùng phải là thành viên của nhóm" });
    }

    // Check if user is already a co-admin
    if (group.coAdmins.some((id) => id.toString() === userId.toString())) {
      return res.status(400).json({ message: "Người dùng đã là phó nhóm" });
    }

    // Add user as co-admin
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $addToSet: { coAdmins: userId } },
      { new: true }
    )
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    res.status(200).json({
      message: "Thêm phó nhóm thành công",
      group: updatedGroup,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi khi thêm phó nhóm", error: error.message });
  }
};

/**
 * Remove a co-admin from the group
 * Permission: Admin only
 */
const removeCoAdmin = async (req, res) => {
  const { groupId, userId } = req.body;
  const currentUserId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Không tìm thấy nhóm" });
    }

    // Only admin can remove co-admins
    if (group.admin.toString() !== currentUserId.toString()) {
      return res
        .status(403)
        .json({ message: "Chỉ admin có thể xóa phó nhóm" });
    }

    // Check if user is a co-admin
    if (!group.coAdmins.some((id) => id.toString() === userId.toString())) {
      return res.status(400).json({ message: "Người dùng không phải phó nhóm" });
    }

    // Remove user from co-admins
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $pull: { coAdmins: userId } },
      { new: true }
    )
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    res.status(200).json({
      message: "Xóa phó nhóm thành công",
      group: updatedGroup,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi khi xóa phó nhóm", error: error.message });
  }
};

/**
 * Get all groups a user is a member of
 */
const getUserGroups = async (req, res) => {
  const userId = req.user._id;

  try {
    const groups = await Group.find({
      members: userId,
    })
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt")
      .sort({ updatedAt: -1 });

    res.status(200).json(groups);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching user groups", error: error.message });
  }
};

/**
 * Delete a group
 * Permission: Admin only
 */
const deleteGroup = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Only admin can delete the group
    if (group.admin.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Only the group admin can delete the group" });
    }

    // Delete all messages in the group
    await Message.deleteMany({ groupId });

    // Delete the group
    await Group.findByIdAndDelete(groupId);

    res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting group", error: error.message });
  }
};

/**
 * Leave a group
 * Permission: Any member
 * Admin cannot leave, they must delete or transfer admin role first
 */
const leaveGroup = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Admin cannot leave the group
    if (group.admin.toString() === userId.toString()) {
      return res.status(403).json({ 
        message: "As the admin, you cannot leave the group. You must either delete the group or transfer admin role first." 
      });
    }

    // Check if user is a member
    if (!group.members.some(id => id.toString() === userId.toString())) {
      return res.status(400).json({ message: "You are not a member of this group" });
    }

    // Remove user from group members and co-admins if applicable
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { 
        $pull: { 
          members: userId,
          coAdmins: userId
        } 
      },
      { new: true }
    )
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    res.status(200).json({ message: "Left group successfully", group: updatedGroup });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error leaving group", error: error.message });
  }
};

/**
 * Check if user is admin or co-admin
 * Used as middleware for protected routes
 */
const isAdminOrCoAdmin = async (req, res, next) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isAdmin = group.admin.toString() === userId.toString();
    const isCoAdmin = group.coAdmins.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isAdmin && !isCoAdmin) {
      return res
        .status(403)
        .json({ message: "You must be an admin or co-admin to perform this action" });
    }

    // Add role info to request for downstream use
    req.userRole = isAdmin ? "admin" : "coAdmin";
    req.group = group;
    next();
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error checking permissions", error: error.message });
  }
};

/**
 * Get user role in group
 */
const getUserRoleInGroup = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  try {
    // Use lean() for better performance since we don't need a full Mongoose document
    const group = await Group.findById(groupId).lean();

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Determine role - Compare as strings to ensure proper comparison
    let role = "member";
    const userIdStr = userId.toString();
    
    // Check admin role - most efficient check first
    if (group.admin.toString() === userIdStr) {
      role = "admin";
    } 
    // Check co-admin role
    else if (group.coAdmins && group.coAdmins.some(id => id.toString() === userIdStr)) {
      role = "coAdmin";
    } 
    // Check if user is a member - this is the most expensive check, so do it last
    else if (group.members && group.members.length > 0) {
      // Convert to string array for faster comparison if needed
      const isMember = group.members.some(id => id.toString() === userIdStr);
      
      if (!isMember) {
        return res.status(403).json({ 
          message: "You are not a member of this group",
          success: false
        });
      }
    } else {
      return res.status(400).json({ 
        message: "Group has no members",
        success: false
      });
    }

    // Return the role with success indicator
    return res.status(200).json({ 
      role,
      success: true
    });
  } catch (error) {
    console.error("Error determining user role:", error);
    return res.status(500).json({ 
      message: "Error determining role", 
      error: error.message,
      success: false
    });
  }
};

/**
 * Update group information
 * Permission: Admin, Co-admin
 */
const updateGroup = async (req, res) => {
  const { groupId } = req.params;
  const { name, description } = req.body;
  const userId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Không tìm thấy nhóm" });
    }

    // Kiểm tra quyền hạn
    const isAdmin = group.admin.toString() === userId.toString();
    const isCoAdmin = group.coAdmins.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isAdmin && !isCoAdmin) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền cập nhật thông tin nhóm" });
    }

    // Cập nhật các trường thông tin nếu được cung cấp
    const updateData = {};
    if (name) updateData.name = name;
    if (description) updateData.description = description;

    // Xử lý upload avatar nếu có
    if (req.files && req.files.avatar) {
      const uploadResult = await cloudinary.uploader.upload(
        req.files.avatar.tempFilePath,
        {
          folder: "group_avatars",
          width: 150,
          crop: "scale",
        }
      );
      updateData.avatarUrl = uploadResult.secure_url;
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      updateData,
      { new: true }
    )
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    res.status(200).json({
      message: "Cập nhật thông tin nhóm thành công",
      group: updatedGroup,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi khi cập nhật thông tin nhóm", error: error.message });
  }
};

/**
 * Update group avatar
 * Permission: Admin, Co-admin
 */
const updateGroupAvatar = async (req, res) => {
  const { groupId } = req.params;
  const { avatarUrl } = req.body;
  const userId = req.user._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Không tìm thấy nhóm" });
    }

    // Kiểm tra quyền hạn
    const isAdmin = group.admin.toString() === userId.toString();
    const isCoAdmin = group.coAdmins.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isAdmin && !isCoAdmin) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền cập nhật ảnh nhóm" });
    }

    // Cập nhật avatar
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { avatarUrl },
      { new: true }
    )
      .populate("members", "name avt")
      .populate("admin", "name avt")
      .populate("coAdmins", "name avt");

    res.status(200).json({
      message: "Cập nhật ảnh nhóm thành công",
      group: updatedGroup,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi khi cập nhật ảnh nhóm", error: error.message });
  }
};

module.exports = {
  createGroup,
  addMember,
  removeMember,
  getGroupDetails,
  addCoAdmin,
  removeCoAdmin,
  getUserGroups,
  deleteGroup,
  isAdminOrCoAdmin,
  updateGroup,
  updateGroupAvatar,
  leaveGroup,
  getUserRoleInGroup,
};
