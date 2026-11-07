"use client"
import { useMemo, useState } from "react"
import { Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCall } from "@/contexts/call-context"
import { getCallOptions } from "@/lib/call-rules"
import type { FirestoreOrder } from "@/components/order-popup-panel"
import { toast } from "@/hooks/use-toast"
export function StoreCallButton({ orders, storeCategory }: { orders: FirestoreOrder[]; storeCategory: string }) {
  const { callState, startCall } = useCall()
  const options = useMemo(() => getCallOptions(orders, storeCategory), [orders, storeCategory])
  const [open, setOpen] = useState(false)

  if (!options.length || callState !== "idle") return null

  const call = (option: typeof options[number]) => {
    setOpen(false)
    void startCall(option.orderDocId, option.peerName).catch((error) => toast({ title: "Call unavailable", description: error instanceof Error ? error.message : "Unable to start call" }))
  }
  const isDriverCall = options[0].phase === "driver"
  const buttonClass = isDriverCall ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"

  if (options.length === 1) return <Button aria-label={options[0].label} onClick={() => call(options[0])} className={`fixed bottom-24 right-4 z-[70] size-14 rounded-full p-0 text-white shadow-lg ${buttonClass}`}><Phone /></Button>

  return <>
    <Button aria-label={`Call (${options.length})`} onClick={() => setOpen((value) => !value)} className={`fixed bottom-24 right-4 z-[70] size-14 rounded-full p-0 text-white shadow-lg ${buttonClass}`}><Phone /><span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">{options.length}</span></Button>
    {open && <div role="dialog" aria-label="Available calls" className="fixed bottom-40 right-4 z-[70] flex w-72 flex-col gap-2 rounded-xl border bg-background p-3 shadow-xl">{options.map((option) => <div key={option.orderDocId} className="flex items-center justify-between gap-2 text-sm"><span>Order #{option.shortId} · {option.peerName}</span><Button size="sm" variant="outline" onClick={() => call(option)}>{option.label}</Button></div>)}</div>}
  </>
}
