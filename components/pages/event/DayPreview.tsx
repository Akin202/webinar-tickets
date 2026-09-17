import { eventConfig } from '@/config/event.config';
import { DAY_PREVIEW } from './event-format';

const { copy } = eventConfig;

/** The day at a glance under the hero: doors, the named speakers, the launch. */
export function DayPreview() {
  return (
    <section className="sp-day" aria-labelledby="day-heading">
      <div className="sp-shell">
        <h2 className="sp-rulehead" id="day-heading">
          <span>{copy.dayPreview.heading}</span>
        </h2>
        <ol className="sp-day__list">
          {DAY_PREVIEW.map((slot) => (
            <li key={slot.time} className={slot.isLaunch ? 'sp-day__row sp-day__row--launch' : 'sp-day__row'}>
              <time className="sp-day__time">{slot.time}</time>
              <span className="sp-day__title">
                {slot.isLaunch && <span className="sp-tag">{copy.dayPreview.launchTag}</span>}
                {slot.title}
              </span>
            </li>
          ))}
        </ol>
        <a className="sp-day__more" href="#programme">
          {copy.dayPreview.fullProgrammeLink}
        </a>
      </div>
    </section>
  );
}
