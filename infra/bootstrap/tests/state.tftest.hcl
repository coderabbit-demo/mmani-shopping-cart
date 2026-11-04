mock_provider "google" {}
variables {
  project_id     = "se-demos-project"
  bucket_name    = "se-demos-project-deskdrop-tfstate"
  state_operator = "user:operator@example.com"
}
run "private_versioned_state" {
  command = plan
  assert {
    condition     = google_storage_bucket.state.uniform_bucket_level_access && google_storage_bucket.state.public_access_prevention == "enforced" && google_storage_bucket.state.versioning[0].enabled && !google_storage_bucket.state.force_destroy
    error_message = "State bucket must remain private, versioned, and non-destructive."
  }
  assert {
    condition     = google_storage_bucket_iam_member.operator.role == "roles/storage.objectAdmin"
    error_message = "Operator access must be scoped to bucket objects."
  }
}
run "wrong_project" {
  command = plan
  variables { project_id = "wrong-project" }
  expect_failures = [var.project_id]
}
run "invalid_principal" {
  command = plan
  variables { state_operator = "allUsers" }
  expect_failures = [var.state_operator]
}
run "wrong_bucket" {
  command = plan
  variables { bucket_name = "unrelated-bucket" }
  expect_failures = [var.bucket_name]
}
