export const detectDeviceType = () =>
  /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(
    navigator.userAgent
  )
    ? "mobile"
    : "desktop";
