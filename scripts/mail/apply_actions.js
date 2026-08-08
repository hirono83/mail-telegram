// export_inbox.js가 만든 메일 목록을 바탕으로, Claude가 결정한 정리 액션을 Mail.app에 적용하는 스크립트.
//
// 실행: osascript -l JavaScript scripts/mail/apply_actions.js <actions.json>
//
// actions.json 형식 (배열):
// [
//   { "messageId": "<rfc-message-id>", "action": "flag" },
//   { "messageId": "<rfc-message-id>", "action": "unflag" },
//   { "messageId": "<rfc-message-id>", "action": "markRead" },
//   { "messageId": "<rfc-message-id>", "action": "markUnread" },
//   { "messageId": "<rfc-message-id>", "action": "move", "mailbox": "Archive" }
// ]
//
// messageId는 export_inbox.js가 내보낸 각 메일의 "messageId" (RFC Message-ID 헤더) 값을 그대로 사용합니다.
// mailbox는 대상 메일함 이름(계정 내에서 검색)입니다. 하위 폴더까지 재귀적으로 검색합니다.

ObjC.import('Foundation');

function readFile(path) {
  const nsData = $.NSData.dataWithContentsOfFile(path);
  if (!nsData) throw new Error(`파일을 읽을 수 없습니다: ${path}`);
  const nsString = $.NSString.alloc.initWithDataEncoding(nsData, $.NSUTF8StringEncoding);
  return ObjC.unwrap(nsString);
}

function run(argv) {
  const Mail = Application('Mail');
  Mail.includeStandardAdditions = true;

  const actionsPath = argv[0];
  if (!actionsPath) {
    return JSON.stringify({ error: 'usage: apply_actions.js <actions.json>' });
  }

  const actions = JSON.parse(readFile(actionsPath));
  const inboxMessages = Mail.inbox.messages;

  function findMessageByMessageId(messageId) {
    const count = inboxMessages.length;
    for (let i = 0; i < count; i++) {
      const m = inboxMessages[i];
      try {
        if (m.messageId() === messageId) return m;
      } catch (e) {
        /* skip */
      }
    }
    return null;
  }

  function findMailboxRecursive(mailboxes, name) {
    const count = mailboxes.length;
    for (let i = 0; i < count; i++) {
      const mb = mailboxes[i];
      try {
        if (mb.name() === name) return mb;
      } catch (e) {
        continue;
      }
      try {
        const nested = findMailboxRecursive(mb.mailboxes, name);
        if (nested) return nested;
      } catch (e) {
        /* no sub-mailboxes */
      }
    }
    return null;
  }

  function findMailboxByName(name) {
    const accounts = Mail.accounts();
    for (const acc of accounts) {
      try {
        const found = findMailboxRecursive(acc.mailboxes, name);
        if (found) return found;
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  const results = [];

  for (const action of actions) {
    const msg = findMessageByMessageId(action.messageId);
    if (!msg) {
      results.push({ messageId: action.messageId, status: 'not_found' });
      continue;
    }
    try {
      if (action.action === 'flag') {
        msg.flaggedStatus = true;
      } else if (action.action === 'unflag') {
        msg.flaggedStatus = false;
      } else if (action.action === 'markRead') {
        msg.readStatus = true;
      } else if (action.action === 'markUnread') {
        msg.readStatus = false;
      } else if (action.action === 'move') {
        const dest = findMailboxByName(action.mailbox);
        if (!dest) {
          results.push({ messageId: action.messageId, status: 'mailbox_not_found', mailbox: action.mailbox });
          continue;
        }
        Mail.move(msg, { to: dest });
      } else {
        results.push({ messageId: action.messageId, status: 'unknown_action', action: action.action });
        continue;
      }
      results.push({ messageId: action.messageId, status: 'ok', action: action.action });
    } catch (e) {
      results.push({ messageId: action.messageId, status: 'error', error: String(e) });
    }
  }

  return JSON.stringify({ appliedAt: new Date().toISOString(), results: results });
}
