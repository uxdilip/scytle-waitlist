'use server'

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendSupportEmail(email: string, message: string) {
    if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured')
    }

    try {
        const data = await resend.emails.send({
            from: 'Scytle Support <support@scytle.com>',
            to: ['support@scytle.com'],
            replyTo: email,
            subject: `New Support Request from ${email}`,
            html: `
                <div style="font-family: sans-serif; max-w-[600px]; padding: 20px;">
                    <h2 style="color: #333;">New Message via Dashboard Help Widget</h2>
                    <p><strong>From:</strong> ${email}</p>
                    <hr style="border-top: 1px solid #eaeaea; margin: 20px 0;" />
                    <p style="white-space: pre-wrap; font-size: 16px; color: #444;">${message}</p>
                </div>
            `
        })

        if (data.error) {
            console.error('Resend API Error:', data.error);
            return { success: false, error: data.error.message }
        }

        return { success: true }
    } catch (error) {
        console.error('Failed to send support email:', error)
        return { success: false, error: 'Internal Server Error' }
    }
}
