'use server'

import { createAdminClient, DATABASE_ID, ID, Query } from '@/lib/appwrite-server'
import { Resend } from 'resend'

const WAITLIST_COLLECTION = 'waitlist'
const resend = new Resend(process.env.RESEND_API_KEY)

export async function joinWaitlist(formData: FormData) {
  const email = formData.get('email') as string

  if (!email || !email.includes('@')) {
    return { error: 'Please enter a valid email address.' }
  }

  try {
    const { databases } = createAdminClient()
    
    // Check if already exists to avoid duplicates if no unique index
    const existing = await databases.listDocuments(DATABASE_ID, WAITLIST_COLLECTION, [
      Query.equal('email', email)
    ])

    if (existing.total > 0) {
      return { success: true } // Act like it worked to prevent spam/enumeration
    }

    // Insert
    await databases.createDocument(
      DATABASE_ID,
      WAITLIST_COLLECTION,
      ID.unique(),
      {
        email,
        createdAt: new Date().toISOString(),
        isApproved: false,
      }
    )

    // Notify Admin via Resend
    if (process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: 'Scytle Waitlist <support@scytle.com>',
          to: 'admin@scytle.com',
          subject: '🚀 New Waitlist Signup!',
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2 style="color: #333;">New Beta Waitlist Signup</h2>
              <p style="font-size: 16px;"><strong>Email:</strong> ${email}</p>
              <p style="color: #666; font-size: 14px;">Log in to your Appwrite dashboard to view all signups.</p>
            </div>
          `
        })
      } catch (emailError) {
        console.error('Failed to send Resend notification:', emailError)
        // Do not throw error here, as the user successfully joined the waitlist
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Waitlist error:', error)
    return { error: 'Failed to join waitlist. Please try again later. Ensure the waitlist collection exists in Appwrite.' }
  }
}
