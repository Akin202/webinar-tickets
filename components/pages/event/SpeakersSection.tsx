import Image from 'next/image';
import { eventConfig } from '@/config/event.config';
import { initialsOf } from './event-format';

const { speakers, programme, copy } = eventConfig;

/** "11:15" for a speaker's slot, so the list doubles as a who-and-when. */
function slotTimeFor(speakerId: string): string | null {
  return programme.find((slot) => slot.speakerId === speakerId)?.time ?? null;
}

/** Everyone speaking, as a list of people with their slot time. No invented photos. */
export function SpeakersSection() {
  return (
    <section className="sp-band" id="speakers" aria-labelledby="speakers-heading">
      <div className="sp-shell">
        <div className="sp-head">
          <h2 id="speakers-heading">{copy.speakers.heading}</h2>
          <p>{copy.speakers.body}</p>
        </div>
        <ul className="sp-speakers">
          {speakers.map((speaker) => {
            const time = slotTimeFor(speaker.id);
            return (
              <li key={speaker.id} className={speaker.announced ? 'sp-spk' : 'sp-spk sp-spk--tba'}>
                <div className="sp-spk__avatar" aria-hidden="true">
                  {speaker.photoUrl ? (
                    <Image src={speaker.photoUrl} alt="" fill sizes="88px" loading="lazy" />
                  ) : (
                    <span>{speaker.announced ? initialsOf(speaker.name) : '+1'}</span>
                  )}
                </div>
                <div className="sp-spk__text">
                  <h3>{speaker.name}</h3>
                  {speaker.role && <p className="sp-spk__role">{speaker.role}</p>}
                  {speaker.announced && time && (
                    <p className="sp-spk__time">
                      On stage <time>{time}</time>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
