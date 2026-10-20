
export const EASE_OUT = [0.16, 1, 0.3, 1];
export const SPRING_SOFT = { type: 'spring', stiffness: 300, damping: 26 };
export const SPRING_SNAPPY = { type: 'spring', stiffness: 420, damping: 30 };

export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
};

export const pop = {
  hidden: { opacity: 0, scale: 0.85 },
  show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } },
};

export const tapScale = { whileHover: { scale: 1.04 }, whileTap: { scale: 0.96 } };