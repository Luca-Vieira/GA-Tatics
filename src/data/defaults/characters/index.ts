import { parseRoster, type CharacterDefinition } from '../../schemas/character';
import bixo from './bixo.json';
import derson from './derson.json';
import felipao from './felipao.json';
import gustavo from './gustavo.json';
import helder from './helder.json';
import joaoLucas from './joao_lucas.json';
import leo from './leo.json';
import marquinhos from './marquinhos.json';
import matheus from './matheus.json';
import moco from './moco.json';
import vinicius from './vinicius.json';
import wender from './wender.json';
import wilian from './wilian.json';

/** Elenco inicial (13 personagens), validado ao carregar. */
export const DEFAULT_CHARACTERS: readonly CharacterDefinition[] = parseRoster([
  bixo,
  vinicius,
  leo,
  marquinhos,
  felipao,
  joaoLucas,
  matheus,
  helder,
  wilian,
  wender,
  gustavo,
  moco,
  derson,
]);
