import { auth } from "@/lib/firebase"

const BASE_URL = "https://aletwend-render-backend.onrender.com"

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new Error("You must be signed in to call")
  const response = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(body) })
  const data = await response.json() as T & { success?: boolean; error?: string }
  if (!response.ok || data.success === false) throw new Error(data.error || "Unable to start call")
  return data
}

export interface CallCredentials { callId: string; channel: string; appId: string; token: string; uid: string; expiresAt?: number }
export const startCall = (orderId: string) => request<CallCredentials>("/api/calls/start", { orderId })
export const acceptCall = (callId: string) => request<CallCredentials>("/api/calls/accept", { callId })
export const declineCall = (callId: string) => request<{ callId: string }>("/api/calls/decline", { callId })
export const endCall = (callId: string, reason?: string) => request<{ callId: string }>("/api/calls/end", { callId, ...(reason ? { reason } : {}) })
