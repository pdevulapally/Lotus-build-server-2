import { IsString, Length, Matches } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Length(2, 50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug!: string;
}
