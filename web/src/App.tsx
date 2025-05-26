import React from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SettingsPage from "./pages/SettingsPage";
import SearchPage from "./pages/SearchPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import UnifiedChatPage from "./pages/UnifiedChatPage";
import FriendsPage from "./pages/FriendsPage";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import "./App.scss";

// Wrapper components for redirecting with params
const DirectChatRedirect: React.FC = () => {
  const { friendId } = useParams<{ friendId: string }>();
  return <Navigate to={`/chats/direct/${friendId}`} replace />;
};

const GroupChatRedirect: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  return <Navigate to={`/chats/group/${groupId}`} replace />;
};

const App: React.FC = () => {
  console.log("App component rendering - checking routes");

  // Debug route for Friends
  React.useEffect(() => {
    console.log("Checking friends route in useEffect");
  }, []);

  return (
    <div className="app">
      <Navbar />
      <div className="container">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected Routes */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Debug Route for Friends */}
          <Route
            path="/friends"
            element={
              <ProtectedRoute>
                <FriendsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/:userId?"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/search"
            element={
              <ProtectedRoute>
                <SearchPage />
              </ProtectedRoute>
            }
          />
          
          {/* Unified Chat Routes */}
          <Route
            path="/chats"
            element={
              <ProtectedRoute>
                <UnifiedChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chats/:chatType/:chatId"
            element={
              <ProtectedRoute>
                <UnifiedChatPage />
              </ProtectedRoute>
            }
          />
          
          {/* Legacy routes that redirect to the unified chat page */}
          <Route
            path="/chat"
            element={<Navigate to="/chats" replace />}
          />
          <Route
            path="/chat/:friendId"
            element={<DirectChatRedirect />}
          />
          <Route
            path="/groups"
            element={<Navigate to="/chats" replace />}
          />
          <Route
            path="/group/:groupId"
            element={<GroupChatRedirect />}
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default App;
