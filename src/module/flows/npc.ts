// Import TypeScript modules
import { LANCER } from "../config";
import { LancerActor } from "../actor/lancer-actor";
import { renderTemplateStep } from "./_render";
import { LancerItem, LancerNPC_FEATURE } from "../item/lancer-item";
import { rollTextMacro } from "./text";
import { NpcFeatureType } from "../enums";
import { prepareAttackMacro } from "./attack";
import { prepareTechMacro } from "./tech";
import { LancerFlowState } from "./interfaces";
import { SystemTemplates } from "../system-template";
import { rollReactionMacro } from "./reaction";

export async function prepareNPCFeatureMacro(
  item: string | LancerItem,
  options?: {
    display?: boolean;
  }
) {
  item = LancerItem.fromUuidSync(item);
  if (!item.actor || !item.is_npc_feature()) return;

  switch (item.system.type) {
    case NpcFeatureType.Weapon:
      if (!options?.display) return prepareAttackMacro(item);
    case NpcFeatureType.Tech:
      if (!options?.display) return prepareTechMacro(item);
    case NpcFeatureType.System:
    case NpcFeatureType.Trait:
      let sysData: LancerFlowState.TextRollData = {
        docUUID: item.uuid,
        title: item.name!,
        description: item.system.effect,
        tags: item.system.tags,
      };

      return rollTextMacro(sysData);
    case NpcFeatureType.Reaction:
      let reactData: LancerFlowState.ReactionRollData = {
        docUUID: item.uuid,
        title: item.name!,
        trigger: (item.system as SystemTemplates.NPC.ReactionData).trigger,
        effect: (item.system as SystemTemplates.NPC.ReactionData).effect,
        tags: (item.system as SystemTemplates.NPC.ReactionData).tags,
      };

      return rollReactionMacro(reactData);
  }
}

export async function prepareChargeMacro(actor: string | LancerActor) {
  // Determine which Actor to speak as
  let npc = LancerActor.fromUuidSync(actor);
  if (!npc || !npc.is_npc()) return;

  const feats = npc.itemTypes.npc_feature as LancerNPC_FEATURE[];
  if (!feats.length) return;

  // Make recharge roll.
  const roll = await new Roll("1d6").evaluate({ async: true });
  const roll_tt = await roll.getTooltip();
  // Iterate over each system with recharge, if val of tag is lower or equal to roll, set to charged.

  let changed: { name: string; target: string | null | number | undefined; charged: boolean }[] = [];
  for (let feat of feats) {
    if (!feat.system.charged) {
      const recharge = feat.system.tags.find(tag => tag.is_recharge);
      if (recharge && recharge.num_val && recharge.num_val <= (roll.total ?? 0)) {
        await feat.update({ "system.charged": true });
      }
      if (recharge) {
        changed.push({ name: feat.name!, target: recharge.num_val, charged: feat.system.charged });
      }
    }
  }

  // Skip chat if no changes found.
  if (changed.length === 0) return;

  // Render template.
  const templateData = {
    actorName: npc.name,
    roll: roll,
    roll_tooltip: roll_tt,
    changed: changed,
  };
  const template = `systems/${game.system.id}/templates/chat/charge-card.hbs`;
  return renderTemplateStep(npc, template, templateData);
}
