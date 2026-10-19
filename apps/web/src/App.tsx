import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/context/AuthContext";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { OfflineSyncProvider } from "@/context/OfflineSyncContext";
import { ToastProvider } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { AppRouter } from "@/router";

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <OfflineSyncProvider>
              <WebSocketProvider>
                <AppRouter />
              </WebSocketProvider>
            </OfflineSyncProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
