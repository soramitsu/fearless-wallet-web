import QRCode from 'qrcode';
export const getTzip10Link = (url: string, payload: string): string => `${url}?type=tzip10&data=${payload}`;

export const getQrData = async (payload: string) => {
  console.log(payload, 'pauload');
  const qr = await QRCode.toDataURL(payload);

  return qr;
};
