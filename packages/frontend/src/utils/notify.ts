import { toastSuccess, toastError } from './toast';

export function notifyTaskComplete(title: string, status: 'done' | 'failed') {
  if (status === 'done') {
    toastSuccess(`Task completed: ${title}`);
  } else {
    toastError(`Task failed: ${title}`);
  }
  // Browser notification when tab is not focused
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(status === 'done' ? 'Task Completed' : 'Task Failed', {
      body: title,
      icon: '/favicon.ico',
    });
  }
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
