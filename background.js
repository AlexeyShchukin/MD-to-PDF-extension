chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({ url: "https://md2pdf.dev/" });
});
