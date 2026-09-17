import { eventConfig } from '@/config/event.config';

const { programme, copy } = eventConfig;

function rowClass(slot: (typeof programme)[number]): string {
  if (slot.isLaunch) return 'sp-prog__row sp-prog__row--launch';
  if (slot.isBreak) return 'sp-prog__row sp-prog__row--break';
  if (slot.speakerId === 'tba') return 'sp-prog__row sp-prog__row--tba';
  return 'sp-prog__row';
}

/** The full day in order, in the same row grammar as the hero's preview. */
export function ProgrammeSection() {
  return (
    <section className="sp-band" id="programme" aria-labelledby="programme-heading">
      <div className="sp-shell sp-prog">
        <div className="sp-head">
          <h2 id="programme-heading">{copy.programme.heading}</h2>
          <p>{copy.programme.body}</p>
        </div>
        <ol className="sp-prog__list">
          {programme.map((slot) => (
            <li key={slot.time} className={rowClass(slot)}>
              <time className="sp-prog__time">{slot.time}</time>
              <span className="sp-prog__title">
                {slot.isLaunch && <span className="sp-tag">{copy.dayPreview.launchTag}</span>}
                {slot.title}
              </span>
              <span className="sp-prog__dur">{slot.durationMins ? `${slot.durationMins} min` : ''}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
