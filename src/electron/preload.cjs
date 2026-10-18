'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const commands=new Set(['new','quadrants','timeline','archive','undo','redo','search','import','reminders','open-task','reminder-test']);
contextBridge.exposeInMainWorld('focusNative',{
  platform:process.platform,
  load:()=>ipcRenderer.invoke('focus:load'),
  save:snapshot=>ipcRenderer.invoke('focus:save',snapshot),
  exportData:()=>ipcRenderer.invoke('focus:export'),
  importData:()=>ipcRenderer.invoke('focus:import'),
  revealData:()=>ipcRenderer.invoke('focus:reveal-data'),
  getReminders:()=>ipcRenderer.invoke('focus:reminders'),
  dismissReminders:keys=>ipcRenderer.invoke('focus:dismiss-reminders',keys),
  testReminder:()=>ipcRenderer.invoke('focus:test-reminder'),
  onAction:callback=>{
    const listener=(_event,action)=>{if(action && commands.has(action.type))callback(action);};
    ipcRenderer.on('focus:action',listener);
    return()=>ipcRenderer.removeListener('focus:action',listener);
  },
});
