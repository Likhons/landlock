// Shared by the app, the receipt and the public verify page.

// Backend address: set VITE_API_URL in frontend/.env (see .env.example); defaults to the local backend.
export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

export const EVENT_LABEL = {
  SALE_INITIATED: { bn: 'বিক্রয় শুরু', en: 'Sale initiated' },
  SALE_BLOCKED: { bn: 'বিক্রয় আটকানো হয়েছে', en: 'Sale blocked' },
  REGISTRATION_DONE: { bn: 'দলিল নিবন্ধিত', en: 'Deed registered' },
  MUTATION_DONE: { bn: 'নামজারি সম্পন্ন', en: 'Mutation done' },
  MUTATION_REJECTED: { bn: 'নামজারি বাতিল (বিরোধপূর্ণ)', en: 'Mutation rejected (Disputed)' },
  SALE_CANCELLED: { bn: 'বিক্রয় বাতিল', en: 'Sale cancelled' },
  MORTGAGE_CREATED: { bn: 'বন্ধক নিবন্ধিত', en: 'Mortgage registered' },
  MORTGAGE_BLOCKED: { bn: 'বন্ধক আটকানো হয়েছে', en: 'Mortgage blocked' },
  MORTGAGE_RELEASED: { bn: 'বন্ধক মুক্ত', en: 'Mortgage released' },
  GENESIS: { bn: 'শুরুর রেজিস্টার (Genesis)', en: 'Starting register (Genesis)' },
  REGISTRY_MUTATION_DONE: { bn: 'পুরনো দলিলের নামজারি সম্পন্ন', en: 'Mutation of earlier deed done' },
  AGREEMENT_CREATED: { bn: 'বায়নাপত্র নিবন্ধিত', en: 'Sale agreement registered' },
  AGREEMENT_BLOCKED: { bn: 'বায়নাপত্র আটকানো হয়েছে', en: 'Sale agreement blocked' },
  AGREEMENT_CANCELLED: { bn: 'বায়নাপত্র বাতিল', en: 'Sale agreement cancelled' },
}

// Event data fields shown on a receipt (in this order); anything else is left out
export const DATA_LABEL = {
  seller: { bn: 'বিক্রেতা', en: 'Seller' },
  seller_father: { bn: 'বিক্রেতার পিতা', en: "Seller's father" },
  seller_nid: { bn: 'বিক্রেতার NID', en: "Seller's NID" },
  buyer: { bn: 'ক্রেতা', en: 'Buyer' },
  buyer_father: { bn: 'ক্রেতার পিতা', en: "Buyer's father" },
  buyer_nid: { bn: 'ক্রেতার NID', en: "Buyer's NID" },
  owner: { bn: 'বন্ধকদাতা', en: 'Mortgagor' },
  owner_father: { bn: 'বন্ধকদাতার পিতা', en: "Mortgagor's father" },
  owner_nid: { bn: 'বন্ধকদাতার NID', en: "Mortgagor's NID" },
  new_owner: { bn: 'নতুন মালিক', en: 'New owner' },
  previous_owner: { bn: 'আগের মালিক', en: 'Previous owner' },
  deed_no: { bn: 'দলিল নং', en: 'Deed no.' },
  deed_area: { bn: 'পরিমাণ (শতক)', en: 'Area (decimal)' },
  agreement_no: { bn: 'বায়নাপত্র নং', en: 'Agreement no.' },
  advance: { bn: 'অগ্রিম (টাকা)', en: 'Advance (taka)' },
  bank: { bn: 'ব্যাংক', en: 'Bank' },
  loan_ref: { bn: 'ঋণ নং', en: 'Loan no.' },
  reason: { bn: 'কারণ', en: 'Reason' },
}

export const ROLE_NAME = {
  buyer: { bn: 'ক্রেতা', en: 'Buyer' },
  sub_registrar: { bn: 'সাব-রেজিস্ট্রার', en: 'Sub-Registrar' },
  ac_land: { bn: 'এসি ল্যান্ড অফিসার', en: 'AC Land Officer' },
}

// Link the receipt's QR code opens: this site's public verify page for one ledger entry
export const verifyUrl = (hash) => `${window.location.origin}${window.location.pathname}?verify=${hash}`
