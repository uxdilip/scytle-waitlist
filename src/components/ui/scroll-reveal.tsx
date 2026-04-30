'use client'

import { motion, HTMLMotionProps } from 'framer-motion'

interface ScrollRevealProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
  delay?: number
  y?: number
  duration?: number
  once?: boolean
}

export function ScrollReveal({
  children,
  delay = 0,
  y = 30,
  duration = 0.6,
  once = true,
  className,
  ...props
}: ScrollRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: 'blur(4px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once, margin: '-50px' }}
      transition={{ duration, delay, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
