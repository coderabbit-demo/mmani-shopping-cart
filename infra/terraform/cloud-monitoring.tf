resource "google_secret_manager_secret" "monitoring_management" {
  project   = var.project_id
  secret_id = "deskdrop-datadog-management"
  labels    = local.labels
  replication {
    auto {}
  }
  depends_on = [google_project_service.api]
}

resource "google_secret_manager_secret_iam_member" "monitoring_management" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.monitoring_management.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
