mock_provider "google" {}
variables {
  project_id  = "se-demos-project"
  region      = "us-central1"
  zone        = "us-central1-a"
  environment = "demo"
  phase       = "foundation"
}
run "management_is_separate" {
  command = plan
  assert {
    condition     = google_secret_manager_secret.monitoring_management.secret_id != google_secret_manager_secret.intake.secret_id
    error_message = "Management and intake must be separate secret resources."
  }
  assert {
    condition     = google_secret_manager_secret_iam_member.monitoring_management.role == "roles/secretmanager.secretAccessor"
    error_message = "Management access must use a resource-scoped accessor grant."
  }
}
