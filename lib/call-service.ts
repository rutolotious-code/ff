import type { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng"

export async function joinChannel(credentials: { appId: string; token: string; channel: string; uid: string }, onRemoteAudio: (user: unknown) => void) {
  const { default: AgoraRTC } = await import("agora-rtc-sdk-ng")
  let client: IAgoraRTCClient | null = null
  let microphone: IMicrophoneAudioTrack | null = null
  try {
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" })
    client.on("user-published", async (user, mediaType) => {
      await client?.subscribe(user, mediaType)
      if (mediaType === "audio") { user.audioTrack?.play(); onRemoteAudio(user) }
    })
    await client.join(credentials.appId, credentials.channel, credentials.token, credentials.uid)
    microphone = await AgoraRTC.createMicrophoneAudioTrack()
    await client.publish([microphone])
    return { leave: async () => { microphone?.close(); await client?.leave() }, setMuted: async (muted: boolean) => microphone?.setEnabled(!muted) }
  } catch (error) {
    microphone?.close(); await client?.leave().catch(() => undefined); throw error
  }
}
