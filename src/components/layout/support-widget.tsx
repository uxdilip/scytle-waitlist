'use client'

import React, { useState, useEffect } from 'react'
import { HelpCircle, X, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store'
import { databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { sendSupportEmail } from '@/actions/support'

export function SupportWidget() {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)
    const { user } = useAuthStore()
    const [isLoading, setIsLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [message, setMessage] = useState('')

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        
        if (!message.trim()) return
        setIsLoading(true)

        try {
            const userEmail = user?.email || email
            if (!userEmail) {
                toast.error('Please provide an email address.')
                setIsLoading(false)
                return
            }

            // Save to Appwrite database
            await databases.createDocument(
                DATABASE_ID, 
                COLLECTIONS.SUPPORT_TICKETS, 
                'unique()', 
                { 
                    email: userEmail, 
                    subject: 'Message from Dashboard Widget', 
                    message,
                    status: 'open'
                }
            )

            // Trigger Email Notification (Resend API)
            const emailResult = await sendSupportEmail(userEmail, message)
            if (!emailResult.success) {
                console.warn('Database saved, but email forwarding failed:', emailResult.error)
                // We still show success since it's saved in the database
            }
            
            toast.success('Your message has been sent. We\'ll get back to you soon!')
            setMessage('')
            setIsPopoverOpen(false)
        } catch (error) {
            console.error('Failed to send message:', error)
            toast.error('Failed to send message. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    // Ctrl + Enter to submit
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isPopoverOpen && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isPopoverOpen, message, email, user])

    return (
        <div className="fixed bottom-6 right-6 z-50">
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button 
                        size="icon" 
                        className="h-12 w-12 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] bg-[#1A1A1A] hover:bg-black text-white hover:scale-[1.04] active:scale-[0.96] transition-all duration-300 border border-white/5"
                    >
                        {isPopoverOpen ? <X className="w-6 h-6" /> : <HelpCircle className="w-[26px] h-[26px] stroke-[1.5]" />}
                    </Button>
                </PopoverTrigger>
                
                <PopoverContent 
                    align="end" 
                    sideOffset={16}
                    className="w-[420px] min-h-[220px] p-0 rounded-[12px] border border-border shadow-2xl bg-white flex flex-col overflow-hidden"
                >
                    <form onSubmit={handleSubmit} className="flex flex-col flex-1 relative">
                        <textarea 
                            autoFocus
                            placeholder="What's on your mind?"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="flex-1 w-full p-5 bg-transparent border-none outline-none resize-none text-[15px] text-foreground placeholder:text-muted-foreground/50 min-h-[160px] font-mono leading-relaxed"
                            style={{ boxShadow: 'none' }}
                        />
                        
                        {/* Guest Email Field (Hidden if logged in) */}
                        {!user && (
                            <div className="px-5 pb-2">
                                <Input 
                                    type="email"
                                    placeholder="Your email address..."
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="h-8 px-0 text-[13px] bg-transparent border-t border-b-0 border-l-0 border-r-0 border-border/40 rounded-none shadow-none focus-visible:ring-0"
                                />
                            </div>
                        )}
                        
                        <div className="p-4 bg-white flex justify-end">
                            <Button 
                                type="submit" 
                                disabled={isLoading || !message.trim() || (!user && !email.trim())}
                                className="h-9 px-4 rounded-[6px] bg-[#222222] hover:bg-black text-white font-medium text-[13px] flex items-center gap-2 transition-colors"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : null}
                                Send to the Scytle team 
                                <span className="text-white/60 text-[11px] ml-1 flex items-center font-medium opacity-80 tracking-wider">
                                    Ctrl + ↵
                                </span>
                            </Button>
                        </div>
                    </form>
                </PopoverContent>
            </Popover>
        </div>
    )
}
