output "vm_name" { value = google_compute_instance.demo.name }
output "zone" { value = var.zone }
output "registry" { value = "us-central1-docker.pkg.dev/${var.project_id}/deskdrop/deskdrop" }
output "image_digest" { value = var.image_digest }
output "secret_name" { value = google_secret_manager_secret.intake.secret_id }
output "runtime_service_account" { value = google_service_account.runtime.email }
output "iap_command" { value = "gcloud compute ssh deskdrop-demo --project=se-demos-project --zone=us-central1-a --tunnel-through-iap" }
output "phase" { value = var.phase }
output "build_service_account" { value = local.cloud_release ? google_service_account.build[0].email : null }
output "publisher_service_account" { value = local.cloud_release ? google_service_account.publisher[0].email : null }
output "source_bucket" { value = local.cloud_release ? google_storage_bucket.release["source"].name : null }
output "artifact_bucket" { value = local.cloud_release ? google_storage_bucket.release["artifacts"].name : null }
