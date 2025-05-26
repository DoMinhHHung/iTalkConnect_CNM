import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../redux/hooks";
import "../scss/CreateGroupDialog.scss";
import {
  FiX,
  FiPlus,
  FiSearch,
  FiCheck,
  FiTrash2,
  FiImage,
  FiUsers,
} from "react-icons/fi";

interface CreateGroupDialogProps {
  onClose: () => void;
}

interface Friend {
  _id: string;
  name: string;
  avt?: string;
  isOnline?: boolean;
}

const CreateGroupDialog: React.FC<CreateGroupDialogProps> = ({ onClose }) => {
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [groupAvatar, setGroupAvatar] = useState<File | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1); // Step 1: Group details, Step 2: Add members
  const [isFetchingFriends, setIsFetchingFriends] = useState(false);

  // Fetch friend list when component mounts
  useEffect(() => {
    fetchFriends();
  }, []);

  // Fetch friends list
  const fetchFriends = async () => {
    try {
      setIsFetchingFriends(true);
      setError(null);
      const token = localStorage.getItem("token");

      if (!token) {
        setError("Authentication token not found. Please log in again.");
        return;
      }

      const response = await axios.get(
        "https://italkconnect-v3.onrender.com/api/friendship",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Process the friendship data to get just the friends
      const friendsList = response.data.map((friendship: any) => {
        // Determine which user is the friend (not the current user)
        const friend =
          friendship.requester._id !== user?._id
            ? friendship.requester
            : friendship.recipient;

        return {
          _id: friend._id,
          name: friend.name,
          avt: friend.avt,
          isOnline: friend.isOnline || false,
        };
      });

      setFriends(friendsList);
      setFilteredFriends(friendsList);
    } catch (err) {
      console.error("Error fetching friends:", err);
      setError("Error fetching friends list. Please try again.");
    } finally {
      setIsFetchingFriends(false);
    }
  };

  // Filter friends based on search query
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (!query.trim()) {
      setFilteredFriends(friends);
      return;
    }

    const filtered = friends.filter((friend) =>
      friend.name.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredFriends(filtered);
  };

  // Handle selecting a friend
  const handleSelectFriend = (friend: Friend) => {
    if (selectedFriends.some((f) => f._id === friend._id)) {
      return;
    }
    setSelectedFriends([...selectedFriends, friend]);
  };

  // Handle removing a selected friend
  const handleRemoveFriend = (friendId: string) => {
    setSelectedFriends(
      selectedFriends.filter((friend) => friend._id !== friendId)
    );
  };

  // Handle avatar upload
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setGroupAvatar(file);

      // Create a preview URL
      const reader = new FileReader();
      reader.onload = () => {
        setGroupAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Move to next step
  const handleNextStep = () => {
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }
    setError(null);
    setStep(2);
  };

  // Go back to previous step
  const handleBackStep = () => {
    setStep(1);
  };

  // Create the group
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }

    if (selectedFriends.length === 0) {
      setError("Please add at least one member to the group");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");

      // First upload avatar if exists
      let avatarUrl = null;
      if (groupAvatar) {
        const formData = new FormData();
        formData.append("file", groupAvatar);
        formData.append("type", "image");

        // Use the Cloudinary upload endpoint instead of the regular upload endpoint
        const uploadResponse = await axios.post(
          "https://italkconnect-v3.onrender.com/api/chat/upload-cloudinary",
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        // Handle the different response format from Cloudinary endpoint
        avatarUrl =
          uploadResponse.data.url ||
          (uploadResponse.data.file && uploadResponse.data.file.fileUrl);

        console.log("Avatar uploaded successfully:", avatarUrl);
      }

      // Create the group
      const response = await axios.post(
        "https://italkconnect-v3.onrender.com/api/groups/create",
        {
          name: groupName,
          description: groupDescription,
          avatarUrl,
          members: selectedFriends.map((friend) => friend._id),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("Group created successfully:", response.data);

      // Navigate to the newly created group
      if (response.data && response.data.group && response.data.group._id) {
        navigate(`/group/${response.data.group._id}`);
      } else {
        console.error("Group ID not found in response:", response.data);
        setError(
          "Group created but ID not returned. Please check your groups list."
        );
      }
      onClose();
    } catch (err: any) {
      console.error("Error creating group:", err);
      setError(
        err.response?.data?.message || "Error creating group. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="create-group-dialog-overlay">
      <div className="create-group-dialog">
        <div className="dialog-header">
          <h2>{step === 1 ? "Create a New Group" : "Add Group Members"}</h2>
          <button className="close-button" onClick={onClose}>
            <FiX />
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {step === 1 ? (
          <div className="group-details">
            <div className="avatar-upload">
              <div
                className="avatar-preview"
                onClick={() =>
                  document.getElementById("group-avatar-input")?.click()
                }
              >
                {groupAvatarPreview ? (
                  <img src={groupAvatarPreview} alt="Group avatar preview" />
                ) : (
                  <div className="avatar-placeholder">
                    <FiImage />
                    <span>Add Image (Optional)</span>
                  </div>
                )}
              </div>
              <input
                type="file"
                id="group-avatar-input"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: "none" }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="group-name">Group Name*</label>
              <input
                type="text"
                id="group-name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="group-description">Description (Optional)</label>
              <textarea
                id="group-description"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                placeholder="Enter group description"
                rows={3}
              />
            </div>

            <div className="dialog-actions">
              <button className="cancel-button" onClick={onClose}>
                Cancel
              </button>
              <button className="next-button" onClick={handleNextStep}>
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="add-members">
            <div className="members-info">
              <div className="members-icon">
                <FiUsers size={20} />
              </div>
              <div className="members-text">
                <p>Select friends to add to the group</p>
                <p className="members-note">
                  As group creator, you'll be the admin with permissions to:
                  <ul>
                    <li>Disband the group</li>
                    <li>Remove members</li>
                    <li>Appoint co-admins</li>
                    <li>Add new members</li>
                  </ul>
                </p>
              </div>
            </div>

            <div className="search-container">
              <div className="search-input-container">
                <input
                  type="text"
                  placeholder="Search your friends"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                <FiSearch className="search-icon" />
              </div>
            </div>

            {isFetchingFriends ? (
              <div className="loading-friends">
                Loading your friends list...
              </div>
            ) : (
              <>
                <div className="friends-list">
                  <h3>Your Friends</h3>
                  {filteredFriends.length === 0 ? (
                    <p className="no-friends">
                      {friends.length === 0
                        ? "You don't have any friends yet"
                        : "No friends match your search"}
                    </p>
                  ) : (
                    <ul>
                      {filteredFriends.map((friend) => (
                        <li key={friend._id} className="friend-item">
                          <div className="friend-avatar">
                            {friend.avt ? (
                              <img src={friend.avt} alt={friend.name} />
                            ) : (
                              <div className="avatar-placeholder">
                                {friend.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className="friend-name">{friend.name}</span>
                          <button
                            className="add-friend-button"
                            onClick={() => handleSelectFriend(friend)}
                            disabled={selectedFriends.some(
                              (f) => f._id === friend._id
                            )}
                          >
                            {selectedFriends.some(
                              (f) => f._id === friend._id
                            ) ? (
                              <FiCheck />
                            ) : (
                              <FiPlus />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="selected-friends">
                  <h3>
                    Selected Members{" "}
                    {selectedFriends.length > 0 &&
                      `(${selectedFriends.length})`}
                  </h3>
                  {selectedFriends.length === 0 ? (
                    <p className="no-selected">No members selected yet</p>
                  ) : (
                    <ul>
                      {selectedFriends.map((friend) => (
                        <li key={friend._id} className="selected-friend-item">
                          <div className="friend-avatar">
                            {friend.avt ? (
                              <img src={friend.avt} alt={friend.name} />
                            ) : (
                              <div className="avatar-placeholder">
                                {friend.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className="friend-name">{friend.name}</span>
                          <button
                            className="remove-friend-button"
                            onClick={() => handleRemoveFriend(friend._id)}
                          >
                            <FiTrash2 />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            <div className="dialog-actions">
              <button className="back-button" onClick={handleBackStep}>
                Back
              </button>
              <button
                className="create-button"
                disabled={isLoading || selectedFriends.length === 0}
                onClick={handleCreateGroup}
              >
                {isLoading ? "Creating..." : "Create Group"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateGroupDialog;
