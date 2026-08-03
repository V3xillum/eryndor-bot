import { TextDisplayBuilder, type ModalBuilder } from 'discord.js';

/** Short intro at the top of a modal (Discord Text Display). Max ~400 chars kept for safety. */
export function addModalIntro(modal: ModalBuilder, content: string): ModalBuilder {
  return modal.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(content.trim().slice(0, 400)),
  );
}
