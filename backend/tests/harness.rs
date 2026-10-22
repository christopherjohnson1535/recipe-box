//! The harness itself: isolation, cleanup (also on panic), the fixed clock, and the no-silent-skip rule.

mod common;

use std::process::Command;

use common::TestApp;

async fn schema_exists(probe: &TestApp, schema: &str) -> bool {
    sqlx::query_scalar("select exists (select 1 from pg_namespace where nspname = $1)")
        .bind(schema)
        .fetch_one(&probe.pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn clock_starts_fixed_and_moves_only_when_told() {
    let ctx = TestApp::spawn().await;
    assert_eq!(ctx.clock.now(), common::epoch());
    ctx.clock.advance(chrono::Duration::seconds(5));
    assert_eq!(
        ctx.clock.now(),
        common::epoch() + chrono::Duration::seconds(5)
    );
}

#[tokio::test]
async fn apps_do_not_share_data() {
    let a = TestApp::spawn_as_admin().await;
    let b = TestApp::spawn().await;
    assert_ne!(a.schema(), b.schema());
    let needs_setup = b.get("/api/setup", "").await;
    assert_eq!(needs_setup.json["needsSetup"], true);
}

#[tokio::test]
async fn dropping_an_app_removes_its_schema_and_media_dir() {
    let probe = TestApp::spawn().await;
    let app = TestApp::spawn().await;
    let (schema, media) = (app.schema().to_string(), app.media_dir.clone());
    assert!(schema_exists(&probe, &schema).await);
    assert!(media.exists());
    drop(app);
    assert!(!schema_exists(&probe, &schema).await);
    assert!(!media.exists());
}

#[tokio::test]
async fn a_panicking_test_leaves_no_schema_behind() {
    let probe = TestApp::spawn().await;
    let (tx, rx) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let app = TestApp::spawn_as_admin().await;
                tx.send((app.schema().to_string(), app.media_dir.clone()))
                    .unwrap();
                panic!("deliberate panic inside a test");
            })
    });
    assert!(worker.join().is_err(), "the worker should have panicked");
    let (schema, media) = rx.recv().unwrap();
    assert!(!schema_exists(&probe, &schema).await, "{schema} leaked");
    assert!(!media.exists());
}

/// Run only by `without_a_database_the_harness_panics_loudly`, in a child process with no database configured.
#[tokio::test]
#[ignore = "child-process probe for without_a_database_the_harness_panics_loudly"]
async fn probe_spawn_without_database() {
    let _ = TestApp::spawn().await;
}

#[test]
fn without_a_database_the_harness_panics_loudly() {
    // No TEST_DATABASE_URL and an unreachable Docker daemon: the harness must fail with instructions, never skip.
    let out = Command::new(std::env::current_exe().unwrap())
        .args([
            "--ignored",
            "--exact",
            "probe_spawn_without_database",
            "--nocapture",
        ])
        .env_remove("TEST_DATABASE_URL")
        .env("DOCKER_HOST", "tcp://127.0.0.1:1")
        .output()
        .unwrap();
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(!out.status.success(), "probe must fail, got:\n{stderr}");
    assert!(
        stderr.contains("TEST_DATABASE_URL") && stderr.contains("Docker"),
        "panic message should tell the developer what to do:\n{stderr}"
    );
}
