'use client'

import React, { useState } from 'react'
import { Loader2, Send, Mail } from 'lucide-react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { useAuthStore } from '@/store'
import { databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite'

interface ContactDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ContactDialog({ open, onOpenChange }: ContactDialogProps) {
    const { user } = useAuthStore()
    const [isLoading, setIsLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [subject, setSubject] = useState('')
    const [message, setMessage] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const userEmail = user?.email || email
            if (!userEmail) {
                toast.error('Please provide an email address.')
                setIsLoading(false)
                return
            }

            // Save to Appwrite database (Step 1)
            await databases.createDocument(
                DATABASE_ID, 
                COLLECTIONS.SUPPORT_TICKETS, 
                'unique()', 
                { 
                    email: userEmail, 
                    subject, 
                    message,
                    status: 'open'
                }
            )
            
            toast.success('Your message has been sent. We\'ll get back to you soon!')
            setSubject('')
            setMessage('')
            onOpenChange(false)
        } catch (error) {
            console.error('Failed to send message:', error)
            toast.error('Failed to send message. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] border-border/40 backdrop-blur-xl bg-background/80">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                        <Mail className="w-6 h-6 text-accent" />
                    </div>
                    <DialogTitle className="text-2xl font-display font-bold">Submit a Request</DialogTitle>
                    <DialogDescription className="text-[15px]">
                        Describe your issue or feedback in detail. We typically reply within 24 hours.
                    </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {!user && (
                        <div className="space-y-2">
                            <Label htmlFor="email">Your Email</Label>
                            <Input 
                                id="email"
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="bg-muted/50 border-border/40 focus:bg-background transition-all"
                            />
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="subject">Subject</Label>
                        <Input 
                            id="subject"
                            placeholder="e.g., Billing issue, Bug report, etc."
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            required
                            className="bg-muted/50 border-border/40 focus:bg-background transition-all"
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="message">How can we help?</Label>
                        <Textarea 
                            id="message"
                            placeholder="Tell us more about your request..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                            rows={5}
                            className="bg-muted/50 border-border/40 focus:bg-background transition-all resize-none"
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            onClick={() => onOpenChange(false)}
                            className="rounded-xl"
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={isLoading}
                            className="rounded-xl px-8 min-w-[120px]"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4 mr-2" />
                            )}
                            Send Message
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
