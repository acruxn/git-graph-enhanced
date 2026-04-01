const EMOJI_MAP: Record<string, string> = {
    ':sparkles:': '✨', ':bug:': '🐛', ':fire:': '🔥', ':rocket:': '🚀',
    ':memo:': '📝', ':lipstick:': '💄', ':tada:': '🎉', ':white_check_mark:': '✅',
    ':lock:': '🔒', ':bookmark:': '🔖', ':rotating_light:': '🚨', ':construction:': '🚧',
    ':green_heart:': '💚', ':arrow_down:': '⬇️', ':arrow_up:': '⬆️', ':pushpin:': '📌',
    ':construction_worker:': '👷', ':chart_with_upwards_trend:': '📈', ':recycle:': '♻️',
    ':heavy_plus_sign:': '➕', ':heavy_minus_sign:': '➖', ':wrench:': '🔧', ':hammer:': '🔨',
    ':globe_with_meridians:': '🌐', ':pencil2:': '✏️', ':poop:': '💩', ':rewind:': '⏪',
    ':twisted_rightwards_arrows:': '🔀', ':package:': '📦', ':alien:': '👽', ':truck:': '🚚',
    ':page_facing_up:': '📄', ':boom:': '💥', ':bento:': '🍱', ':wheelchair:': '♿',
    ':bulb:': '💡', ':beers:': '🍻', ':speech_balloon:': '💬', ':card_file_box:': '🗃️',
    ':loud_sound:': '🔊', ':mute:': '🔇', ':see_no_evil:': '🙈', ':zap:': '⚡',
    ':art:': '🎨', ':ambulance:': '🚑', ':wastebasket:': '🗑️',
};

const SHORTCODE_RE = /:[a-z0-9_]+:/g;

export function replaceEmoji(text: string): string {
    return text.replace(SHORTCODE_RE, (match) => EMOJI_MAP[match] ?? match);
}
