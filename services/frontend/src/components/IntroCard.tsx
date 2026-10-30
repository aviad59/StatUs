import { Modal } from './Modal.tsx'

const STEPS = [
  ['🏠', 'עברת לחדר הרביעי בדירת שותפים בפלורנטין. השותפים, בעל הבית והשכנה הם דמויות AI.'],
  ['🎯', 'המטרה: לגלות את כל הסודות של הדמויות. לכל אחד יש משהו שהוא מסתיר.'],
  ['💬', 'מדברים איתם כמו בחיים: לענות בצ׳אט, להגיב לפוסטים ולסטוריז. הם זוכרים מה אמרת ועונים לך.'],
  ['🎬', 'כשקורה משהו במציאות, בדירה או בבניין, הוא קופץ על המסך, ולפעמים צריך להחליט מה עושים.'],
  ['⚡', 'הכפתור "מה קורה עכשיו בדירה?" מקדם את העולם: השותפים כותבים, מגיבים ושולחים לך הודעות.'],
] as const

/** How the game works, over the feed until it's closed (once per device, see `useIntro`). */
export function IntroCard({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <section className="p-5 text-sm">
        <h2 className="pb-3 text-lg font-bold">איך זה עובד?</h2>
        <ul className="space-y-2.5">
          {STEPS.map(([icon, text]) => (
            <li key={icon} className="flex gap-2">
              <span aria-hidden>{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-neutral-900 py-2.5 font-semibold text-white dark:bg-white dark:text-neutral-900"
        >
          יאללה, הבנתי
        </button>
      </section>
    </Modal>
  )
}
