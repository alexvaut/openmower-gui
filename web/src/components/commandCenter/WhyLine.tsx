import {WhyLineOutput} from "./whyLine.ts";
import {bannerClasses} from "./style.ts";

const ICONS: Record<string, string> = {
    emerald: '\u2713',
    amber: '\u26A0',
    red: '\u26A0',
    sky: '\u26A1',
    slate: '\u2022',
};

export const WhyLine = ({why}: {why: WhyLineOutput}) => {
    const b = bannerClasses[why.tone];
    return (
        <div className={`px-5 py-2.5 text-sm border-b border-slate-800 flex items-center gap-2 ${b.bg} ${b.text}`}>
            <span className="text-base">{ICONS[why.tone]}</span>
            <span>
                {why.prefix ? <strong className="font-semibold">{why.prefix}</strong> : null}
                {why.prefix ? ' ' : null}
                {why.message}
            </span>
        </div>
    );
};
