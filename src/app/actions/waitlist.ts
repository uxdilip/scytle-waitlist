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
    
    // Attempt to check if already exists using query (may fail if no index)
    let isDuplicate = false;
    try {
      const existing = await databases.listDocuments(DATABASE_ID, WAITLIST_COLLECTION, [
        Query.equal('email', email)
      ])
      if (existing.total > 0) isDuplicate = true;
    } catch (queryError) {
      // Ignore query error, likely missing index. We'll rely on unique constraint if available.
    }

    if (isDuplicate) {
      return { success: true } // Silently succeed
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
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Waitlist error:', error)
    // If Appwrite throws a 409 Conflict (Duplicate due to unique index)
    if (error?.code === 409 || error?.message?.toLowerCase().includes('duplicate')) {
      return { success: true } // Silently succeed, don't spam the user with errors
    }
    return { error: 'Failed to join waitlist. Please try again later.' }
  }
}
