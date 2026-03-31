mod handler;
mod protocol;

use std::io::{self, BufRead, BufWriter, Write};

use protocol::JsonRpcResponse;

fn main() {
    let stdin = io::stdin().lock();
    let stdout = io::stdout();
    let mut writer = BufWriter::new(stdout.lock());

    for line in stdin.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let resp = JsonRpcResponse::error(0, -32700, format!("parse error: {e}"));
                if let Ok(json) = serde_json::to_string(&resp) {
                    let _ = writeln!(writer, "{json}");
                    let _ = writer.flush();
                }
                continue;
            }
        };

        // Notification (no id) — handle shutdown, ignore others
        if value.get("id").is_none() {
            if value.get("method").and_then(|m| m.as_str()) == Some("shutdown") {
                break;
            }
            continue;
        }

        let response = match serde_json::from_value::<protocol::JsonRpcRequest>(value) {
            Ok(req) => handler::handle_request(&req),
            Err(e) => JsonRpcResponse::error(0, -32700, format!("parse error: {e}")),
        };

        if let Ok(json) = serde_json::to_string(&response) {
            let _ = writeln!(writer, "{json}");
            let _ = writer.flush();
        }
    }
}
