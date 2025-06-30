'use client'

import { useEffect, useRef, useState, ChangeEvent } from 'react'
import DelayKnob from './components/DelayKnob'

type Stem = {
  label: string
  file: string
}

const stems: Stem[] = [
  { label: 'DRUMS', file: 'DRUMS.mp3' },
  { label: 'SYNTHS', file: 'SYNTHS.mp3' },
  { label: 'GUITARS', file: 'GUITARS.mp3' },
  { label: 'BASS', file: 'BASS.mp3' },
  { label: 'VOCALS', file: 'VOCALS.mp3' },
]

export default function Home() {
  const [volumes, setVolumes] = useState<Record<string, number>>(Object.fromEntries(stems.map(s => [s.label, 1])))
  const [delays, setDelays] = useState<Record<string, number>>(Object.fromEntries(stems.map(s => [s.label, 0])))
  const [mutes, setMutes] = useState<Record<string, boolean>>(Object.fromEntries(stems.map(s => [s.label, false])))
  const [solos, setSolos] = useState<Record<string, boolean>>(Object.fromEntries(stems.map(s => [s.label, false])))
  const [varispeed, setVarispeed] = useState(1)
  const [showNotification, setShowNotification] = useState(false)

  const delaysRef = useRef<Record<string, number>>({})
  const audioCtxRef = useRef<AudioContext | null>(null)
  const buffersRef = useRef<Record<string, AudioBuffer>>({})
  const nodesRef = useRef<Record<string, AudioWorkletNode>>({})
  const gainNodesRef = useRef<Record<string, GainNode>>({})
  const delayNodesRef = useRef<Record<string, DelayNode>>({})
  const feedbackGainsRef = useRef<Record<string, GainNode>>({})

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setShowNotification(true)
      const timer = setTimeout(() => setShowNotification(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const ctx = new AudioContext()
      await ctx.audioWorklet.addModule('/granular-processor.js')
      audioCtxRef.current = ctx

      const eighthNoteDelay = 60 / 120 / 2

      const loadStem = async (label: string, file: string) => {
        const res = await fetch(`/stems/millionaire/${file}`)
        const arrayBuffer = await res.arrayBuffer()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        buffersRef.current[label] = audioBuffer

        const gainNode = ctx.createGain()
        const delayNode = ctx.createDelay(5.0)
        const feedback = ctx.createGain()

        delayNode.delayTime.value = eighthNoteDelay
        feedback.gain.value = delaysRef.current[label] || 0

        delayNode.connect(feedback).connect(delayNode)
        delayNode.connect(gainNode)
        gainNode.connect(ctx.destination)

        gainNodesRef.current[label] = gainNode
        delayNodesRef.current[label] = delayNode
        feedbackGainsRef.current[label] = feedback
      }

      for (const { label, file } of stems) {
        delaysRef.current[label] = delays[label] || 0
        await loadStem(label, file)
      }
    }

    init()
  }, [])

  const stopAll = () => {
    Object.values(nodesRef.current).forEach((node) => {
      try {
        node.port.postMessage({ type: 'stop' })
        node.disconnect()
      } catch {}
    })
    nodesRef.current = {}
  }

  const playAll = async () => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    if (ctx.state === 'suspended') await ctx.resume()

    stopAll()

    stems.forEach(({ label }) => {
      const buffer = buffersRef.current[label]
      const gain = gainNodesRef.current[label]
      const delay = delayNodesRef.current[label]
      if (!buffer || !gain || !delay) return

      const node = new AudioWorkletNode(ctx, 'granular-player')
      node.port.postMessage({ type: 'load', buffer: buffer.getChannelData(0) })
      node.parameters.get('playbackRate')?.setValueAtTime(varispeed, ctx.currentTime)
      node.connect(delay)

      const soloed = Object.values(solos).some(Boolean)
      const shouldPlay = soloed ? solos[label] : !mutes[label]
      gain.gain.value = shouldPlay ? volumes[label] : 0

      nodesRef.current[label] = node
    })
  }

  const toggleMute = (label: string) => {
    setMutes((prev) => ({ ...prev, [label]: !prev[label] }))
    setSolos((prev) => ({ ...prev, [label]: false }))
  }

  const toggleSolo = (label: string) => {
    setSolos((prev) => ({ ...prev, [label]: !prev[label] }))
    setMutes((prev) => ({ ...prev, [label]: false }))
  }

  const unsoloAll = () => {
    setSolos(Object.fromEntries(stems.map(({ label }) => [label, false])))
    setMutes(Object.fromEntries(stems.map(({ label }) => [label, false])))
  }

  useEffect(() => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const eighthNoteDelay = 60 / 120 / 2

    stems.forEach(({ label }) => {
      const gain = gainNodesRef.current[label]
      const delay = delayNodesRef.current[label]
      const feedback = feedbackGainsRef.current[label]
      if (!gain || !delay || !feedback) return

      const soloed = Object.values(solos).some(Boolean)
      const shouldPlay = soloed ? solos[label] : !mutes[label]
      gain.gain.value = shouldPlay ? volumes[label] : 0

      delay.delayTime.value = eighthNoteDelay
      feedback.gain.setTargetAtTime(delays[label] || 0, ctx.currentTime, 2.5)
    })
  }, [volumes, mutes, solos, delays])

  useEffect(() => {
    const ctx = audioCtxRef.current
    if (!ctx) return

    Object.values(nodesRef.current).forEach((node) => {
      node.parameters.get('playbackRate')?.setValueAtTime(varispeed, ctx.currentTime)
    })
  }, [varispeed])

  return (
    <main className="min-h-screen bg-[#FCFAEE] text-[#B8001F] p-8 font-sans relative overflow-y-auto" style={{ maxHeight: '100dvh' }}>
      <h1 className="village text-center mb-10" style={{ fontSize: '96px', letterSpacing: '0.05em', lineHeight: '1.1' }}>
        Munyard Mixer
      </h1>

{showNotification && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
    <div className="bg-[#FCFAEE] text-[#B8001F] px-10 py-6 rounded-xl shadow-lg flex flex-col items-center text-center pointer-events-auto">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-16 h-16 mb-4 text-[#B8001F]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582M20 20v-5h-.581M4.582 9A7.5 7.5 0 0112 4.5c4.142 0 7.5 3.358 7.5 7.5M19.418 15A7.5 7.5 0 0112 19.5c-4.142 0-7.5-3.358-7.5-7.5"
        />
      </svg>
      <p className="font-mono text-lg leading-snug">
        ROTATE<br />YOUR<br />PHONE
      </p>
    </div>
  </div>
)}

      <div className="flex gap-4 justify-center mb-8 flex-wrap">
        <button onClick={playAll} className="pressable bg-[#B30000] text-white px-6 py-2 font-mono tracking-wide">Play</button>
        <button onClick={stopAll} className="pressable bg-[#B30000] text-white px-6 py-2 font-mono tracking-wide">Stop</button>
        <button onClick={unsoloAll} className="pressable bg-[#B30000] text-white px-6 py-2 font-mono tracking-wide">UNSOLO</button>
      </div>

      <div className="flex justify-center">
        <div className="flex gap-4 flex-wrap sm:gap-6">
          {stems.map((stem) => (
            <div key={stem.label} className="flex flex-col items-center rounded-lg border border-gray-700 bg-[#B30000] p-3 sm:p-4 w-20 sm:w-24 shadow-inner">
              <div className="w-4 h-10 bg-green-600 animate-pulse mb-4 rounded-sm" />
              <div className="flex flex-col items-center gap-2 text-sm text-white">
                <span className="mb-1">LEVEL</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volumes[stem.label]}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setVolumes((prev) => ({ ...prev, [stem.label]: parseFloat(e.target.value) }))
                  }
                  className="w-1 h-40 appearance-none bg-transparent"
                  style={{ writingMode: 'bt-lr' as React.CSSProperties['writingMode'], WebkitAppearance: 'slider-vertical' as React.CSSProperties['WebkitAppearance'] }}
                />
              </div>
              <div className="my-2">
                <DelayKnob
                  value={delays[stem.label]}
                  onChange={(val) => {
                    setDelays((prev) => ({ ...prev, [stem.label]: val }))
                    delaysRef.current[stem.label] = val
                  }}
                />
              </div>
              <div className="mt-2 flex flex-col gap-2 items-center">
                <button
                  onClick={() => toggleMute(stem.label)}
                  className={`px-2 py-1 text-xs rounded ${
                    mutes[stem.label]
                      ? 'bg-yellow-500 text-black'
                      : 'bg-white text-[#B8001F] hover:bg-[#f0ebd6]'
                  }`}
                >
                  MUTE
                </button>
                <button
                  onClick={() => toggleSolo(stem.label)}
                  className={`px-2 py-1 text-xs rounded ${
                    solos[stem.label]
                      ? 'flash text-black'
                      : 'bg-white text-[#B8001F] hover:bg-[#f0ebd6]'
                  }`}
                >
                  SOLO
                </button>
                <div className="mt-2 px-3 py-1 text-xs rounded bg-white text-[#B8001F]">
                  {stem.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute right-4 top-[260px] flex flex-col items-center">
        <span className="mb-3 text-sm text-red-700 tracking-wider">VARISPEED</span>
        <div
          className="relative flex flex-col items-center border border-red-700 rounded-md"
          style={{ height: '350px', width: '36px', paddingTop: '8px', paddingBottom: '8px' }}
        >
          <div className="absolute left-full top-1/2 transform -translate-y-1/2 w-2 h-[1px] bg-red-700" />
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.01"
            value={2 - varispeed}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setVarispeed(2 - parseFloat(e.target.value))
            }
            className="w-[6px] absolute top-[8px] bottom-[8px] appearance-none bg-transparent z-10"
            style={{
              WebkitAppearance: 'slider-vertical' as React.CSSProperties['WebkitAppearance'],
              writingMode: 'bt-lr' as React.CSSProperties['writingMode'],
              height: 'calc(100% - 16px)',
              transform: 'rotate(180deg)'
            }}
          />
        </div>
      </div>
    </main>
  )
}
