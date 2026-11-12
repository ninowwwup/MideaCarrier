/**
 * CONFIGURAÇÃO DO BANCO DE DADOS EM NUVEM (GOOGLE PLANILHAS)
 *
 * MIGOU - Midea Transfer Hub
 */

import {
  getGoogleSheetsUrl,
  saveGoogleSheetsUrl,
  clearGoogleSheetsUrl,
  isGoogleSheetsConfigured,
  DEFAULT_PRODUCTION_SHEETS_URL,
} from '../services/googleSheetsClient';

export {
  getGoogleSheetsUrl,
  saveGoogleSheetsUrl,
  clearGoogleSheetsUrl,
  isGoogleSheetsConfigured,
  DEFAULT_PRODUCTION_SHEETS_URL,
};

export const DEFAULT_GOOGLE_SHEETS_URL = DEFAULT_PRODUCTION_SHEETS_URL;
