# Hướng dẫn sử dụng Group Management Services

## Giới thiệu

Thư mục này chứa các dịch vụ (services) để quản lý nhóm chat trên ứng dụng di động. Các dịch vụ này giúp:

1. Xác định vai trò người dùng trong nhóm (admin, co-admin, member)
2. Quản lý thành viên nhóm (thêm, xóa, thăng cấp, hạ cấp)
3. Cập nhật thông tin nhóm (tên, mô tả, ảnh đại diện)
4. Xử lý các tác vụ quản trị nhóm khác

## Các dịch vụ có sẵn

### groupPermissionService.ts

Cung cấp các hàm để xác định quyền hạn và quản lý nhóm:

```typescript
// Xác định vai trò người dùng
const role = await groupPermissionService.checkUserPermissions(groupId, userId);

// Lấy thông tin nhóm
const group = await groupPermissionService.getGroupInfo(groupId);

// Cập nhật thông tin nhóm
const success = await groupPermissionService.updateGroupInfo(groupId, {
  name: "Tên nhóm mới",
  description: "Mô tả mới",
  avatar: "URL ảnh mới"
});

// Thêm thành viên
await groupPermissionService.addGroupMember(groupId, memberId);

// Xóa thành viên
await groupPermissionService.removeGroupMember(groupId, memberId);

// Thăng cấp thành viên lên co-admin
await groupPermissionService.promoteToCoAdmin(groupId, memberId);

// Hạ cấp co-admin xuống thành viên thường
await groupPermissionService.demoteFromCoAdmin(groupId, memberId);

// Xóa nhóm
await groupPermissionService.deleteGroup(groupId);
```

## Cách tích hợp vào màn hình

1. Import service:
```typescript
import * as groupPermissionService from "../../services/groupPermissionService";
```

2. Xác định vai trò người dùng:
```typescript
const checkUserPermissions = async () => {
  try {
    const role = await groupPermissionService.checkUserPermissions(groupId, user._id);
    setUserRole(role);
  } catch (error) {
    console.error("Error checking permissions:", error);
    setUserRole("member");
  }
};
```

3. Lấy thông tin nhóm:
```typescript
const loadGroupInfo = async () => {
  try {
    const group = await groupPermissionService.getGroupInfo(groupId);
    
    if (group) {
      setGroupInfo(group);
      // Cập nhật UI với thông tin nhóm
    }
  } catch (error) {
    console.error("Error loading group info:", error);
  }
};
```

## Xử lý lỗi

Tất cả các hàm trong service đều bao gồm xử lý lỗi, trả về giá trị mặc định an toàn khi có lỗi:

- Nếu API chính không hoạt động, service sẽ tự động sử dụng các phương pháp thay thế
- Khi không thể xác định vai trò, mặc định người dùng là thành viên thường ("member")
- Các hoạt động sửa đổi nhóm trả về `boolean` cho biết thành công hay thất bại

## Lưu ý triển khai

Service được thiết kế để xử lý cả lỗi 404 từ endpoint `/check-permissions` trên một số phiên bản API. Nếu endpoint này không tồn tại, service sẽ tự động sử dụng thông tin nhóm để xác định vai trò người dùng.

## Components liên quan

Tham khảo component GroupChatHeader để xem cách hiển thị vai trò người dùng và tùy chọn quản lý nhóm dựa trên quyền hạn. 